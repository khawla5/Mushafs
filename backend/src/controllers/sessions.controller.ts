import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { many, one, query, tx } from '../config/db.js';
import { hasRole, isManagement } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
import { assertProjectView, sessionWithProject } from '../services/access.service.js';
import { createLightCopy, mimeFor, storeAudio, streamFile } from '../services/audio.service.js';
import {
  addExtraRound, afterUpload, assertUploadAllowed, decideNote, forwardFinalNotes,
  nextVersionNo, passSession, registerVersion, submitRound,
} from '../services/workflow.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';

async function loadSessionAccess(req: Request, sessionId: number) {
  const session = await sessionWithProject(sessionId);
  const access = await assertProjectView(req.user!, session.project_id);
  return { session, access };
}

/** Session detail: versions, rounds, notes + decisions, corrections, history, and what *I* can do. */
export async function getSession(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { session, access } = await loadSessionAccess(req, id);
  const me = req.user!.id;
  const round = session.current_round_id ? await one('SELECT * FROM review_rounds WHERE id = $1', [session.current_round_id]) : null;

  // REV-01 unread marker: first open by the assigned reviewer
  if (round && round.status === 'open' && round.reviewer_id === me && !round.first_opened_at) {
    await query('UPDATE review_rounds SET first_opened_at = now() WHERE id = $1', [round.id]);
  }

  const [detail, versions, rounds, notes, corrections, events, quality, timers] = await Promise.all([
    one(
      `SELECT s.*, ss.name_ar AS start_surah_ar, ss.name_en AS start_surah_en, es.name_ar AS end_surah_ar, es.name_en AS end_surah_en,
         p.title AS project_title, p.status AS project_status, p.code AS project_code, p.session_count, p.riwayah, u.full_name AS reader_name
       FROM sessions s JOIN projects p ON p.id = s.project_id JOIN users u ON u.id = p.reader_id
       LEFT JOIN surahs ss ON ss.number = s.start_surah LEFT JOIN surahs es ON es.number = s.end_surah WHERE s.id = $1`,
      [id],
    ),
    many(
      `SELECT v.id, v.kind, v.version_no, v.original_name, v.mime_type, v.size_bytes, v.duration_sec, v.light_status, v.is_approved,
         v.upload_reason, v.uploaded_at, u.full_name AS uploaded_by_name
       FROM versions v JOIN users u ON u.id = v.uploaded_by WHERE v.session_id = $1 ORDER BY v.kind, v.version_no DESC`,
      [id],
    ),
    many(
      `SELECT r.*, u.full_name AS reviewer_name, v.kind AS version_kind, v.version_no,
         (SELECT count(*)::int FROM notes n WHERE n.round_id = r.id) AS notes_count
       FROM review_rounds r JOIN users u ON u.id = r.reviewer_id JOIN versions v ON v.id = r.version_id
       WHERE r.session_id = $1 ORDER BY r.round_no`,
      [id],
    ),
    many(
      `SELECT n.*, t.code AS type_code, t.name_ar AS type_ar, t.name_en AS type_en, t.is_technical, t.is_clear_error,
         a.full_name AS author_name, sr.name_ar AS surah_ar, sr.name_en AS surah_en, r.round_type, r.round_no,
         COALESCE((SELECT json_agg(json_build_object('decision', d.decision, 'comment', d.comment, 'decided_at', d.decided_at, 'by', du.full_name) ORDER BY d.decided_at)
           FROM note_decisions d JOIN users du ON du.id = d.decided_by WHERE d.note_id = n.id), '[]') AS decisions
       FROM notes n JOIN note_types t ON t.id = n.note_type_id JOIN users a ON a.id = n.author_id
       JOIN surahs sr ON sr.number = n.surah JOIN review_rounds r ON r.id = n.round_id
       WHERE n.session_id = $1 ORDER BY r.round_no, n.timestamp_sec`,
      [id],
    ),
    many(
      `SELECT c.*, n.body AS note_body, n.timestamp_sec, n.round_id, du.full_name AS done_by_name, vu.full_name AS verified_by_name
       FROM corrections c JOIN notes n ON n.id = c.note_id LEFT JOIN users du ON du.id = c.done_by LEFT JOIN users vu ON vu.id = c.verified_by
       WHERE c.session_id = $1 ORDER BY c.created_at`,
      [id],
    ),
    many(
      `SELECT e.*, u.full_name AS actor_name FROM session_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.session_id = $1 ORDER BY e.created_at, e.id`,
      [id],
    ),
    many(
      `SELECT q.*, u.full_name AS rated_by_name FROM quality_ratings q LEFT JOIN users u ON u.id = q.rated_by WHERE q.session_id = $1 ORDER BY q.requested_at`,
      [id],
    ),
    many(
      `SELECT t.stage, t.started_at, t.due_at, t.red_at, t.pm_red_at, t.alert_level, t.allowed_hours, u.full_name AS assignee_name
       FROM stage_timers t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.session_id = $1 AND t.completed_at IS NULL`,
      [id],
    ),
  ]);

  const roles = access.teamRoles;
  const finalPhase = round?.round_type === 'final';
  const projectStatus = access.project.status;
  res.json({
    session: detail,
    versions,
    rounds,
    notes,
    corrections,
    events,
    quality,
    timers,
    current_round: round,
    can: {
      upload_raw: roles.includes('technician') && (session.stage === 'editing' || (session.stage === 'in_corrections' && !finalPhase)),
      upload_mixed:
        (roles.includes('mixing_lead') && projectStatus === 'mixing' && ['ready_for_mixing', 'mixed'].includes(session.stage)) ||
        ((roles.includes('mixing_lead') || roles.includes('technician')) && session.stage === 'in_corrections' && finalPhase),
      review: !!round && round.status === 'open' && round.reviewer_id === me && session.stage === 'in_review',
      decide: roles.includes('mujiz') && session.stage === 'in_decision',
      pass: session.stage === 'awaiting_pass' && (roles.includes('technician') || isManagement(req.user)),
      forward: session.stage === 'pm_forward' && hasRole(req.user, 'production_manager', 'admin'),
      extra_round: isManagement(req.user) && (session.stage === 'awaiting_pass' || (session.stage === 'ready_for_mixing' && projectStatus === 'recording')),
      edit_corrections: roles.includes('technician') || (finalPhase && roles.includes('mixing_lead')),
      verify_corrections: roles.includes('mujiz'),
      rate_quality: roles.includes('mixing_lead'),
    },
  });
}

/** FIL-01..03: upload a session file; creates a new approved version and moves the workflow. */
export async function uploadVersion(req: Request, res: Response) {
  const id = Number(req.params.id);
  const kind = (req.body?.kind === 'mixed' ? 'mixed' : 'raw') as 'raw' | 'mixed';
  if (!req.file) throw badRequest('file_required');
  const tmp = req.file.path;
  try {
    const { session, access } = await loadSessionAccess(req, id);
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (kind === 'raw' && ext !== '.wav') throw badRequest('raw_must_be_wav');
    const round = session.current_round_id ? await one('SELECT round_type FROM review_rounds WHERE id = $1', [session.current_round_id]) : null;
    if (kind === 'raw' && !access.teamRoles.includes('technician')) throw forbidden('technician_only');
    if (kind === 'mixed') {
      const finalFix = session.stage === 'in_corrections' && round?.round_type === 'final';
      const ok = access.teamRoles.includes('mixing_lead') || (finalFix && access.teamRoles.includes('technician'));
      if (!ok) throw forbidden('mixing_lead_only');
    }
    const version = await tx(async (db) => {
      const locked = await one('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [id], db);
      const reason = await assertUploadAllowed(db, locked, access.project, kind);
      const versionNo = await nextVersionNo(db, id, kind);
      const relPath = await storeAudio(tmp, session.project_id, session.number, kind, versionNo, ext);
      const v = await registerVersion(db, id, kind, { relPath, originalName: req.file!.originalname, mime: mimeFor(ext), size: req.file!.size }, reason, req.user!.id);
      await afterUpload(db, id, v, reason, req.user!.id);
      await audit(req.user!.id, 'version_uploaded', 'session', id, { version_id: v.id, kind, version_no: versionNo, reason }, db, req);
      return v;
    });
    createLightCopy(version.id, version.file_path);
    res.status(201).json({ version: { ...version, file_path: undefined } });
  } finally {
    await fsp.unlink(tmp).catch(() => undefined);
  }
}

async function versionAccess(req: Request) {
  const v = await one('SELECT * FROM versions WHERE id = $1', [Number(req.params.id)]);
  if (!v) throw notFound('version_not_found');
  await loadSessionAccess(req, v.session_id);
  return v;
}

/** FIL-04 / REV-02: everyone with permission streams the same file (light copy by default). */
export async function streamVersion(req: Request, res: Response) {
  const v = await versionAccess(req);
  const wantOriginal = req.query.quality === 'original';
  if (!wantOriginal && v.light_status === 'ready' && v.light_path) return streamFile(req, res, v.light_path, 'audio/mpeg');
  return streamFile(req, res, v.file_path, v.mime_type);
}

export async function downloadVersion(req: Request, res: Response) {
  const v = await versionAccess(req);
  const s = await one('SELECT s.number, p.code FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = $1', [v.session_id]);
  await audit(req.user!.id, 'version_downloaded', 'version', v.id, null, undefined, req);
  const ext = path.extname(v.file_path);
  return streamFile(req, res, v.file_path, v.mime_type, `${s.code}-S${String(s.number).padStart(2, '0')}-${v.kind}-v${v.version_no}${ext}`);
}

// --------------------------------------------------------------------------
// Notes (REV-03, REV-04)
// --------------------------------------------------------------------------
async function assertAyahInRange(session: any, surah: number, ayah: number) {
  const s = await one('SELECT ayah_count FROM surahs WHERE number = $1', [surah]);
  if (!s || ayah < 1 || ayah > s.ayah_count) throw badRequest('invalid_ayah');
  if (session.start_surah) {
    const pos = surah * 1000 + ayah;
    if (pos < session.start_surah * 1000 + session.start_ayah || pos > session.end_surah * 1000 + session.end_ayah) {
      throw badRequest('ayah_outside_session_range');
    }
  }
}

async function openRoundForReviewer(roundId: number, userId: number) {
  const round = await one('SELECT * FROM review_rounds WHERE id = $1', [roundId]);
  if (!round) throw notFound('round_not_found');
  if (round.reviewer_id !== userId) throw forbidden('not_round_reviewer');
  if (round.status !== 'open') throw conflict('round_already_submitted');
  return round;
}

export async function addNote(req: Request, res: Response) {
  const roundId = Number(req.params.id);
  const round = await openRoundForReviewer(roundId, req.user!.id);
  const session = await sessionWithProject(round.session_id);
  if (session.current_round_id !== round.id) throw conflict('round_not_current');
  const b = req.body as { note_type_id: number; surah: number; ayah: number; timestamp_sec: number; body: string };
  await assertAyahInRange(session, b.surah, b.ayah);
  const type = await one('SELECT id FROM note_types WHERE id = $1 AND is_active', [b.note_type_id]);
  if (!type) throw badRequest('invalid_note_type');
  const v = await one('SELECT duration_sec FROM versions WHERE id = $1', [round.version_id]);
  if (v?.duration_sec && b.timestamp_sec > Number(v.duration_sec) + 1) throw badRequest('timestamp_beyond_duration');
  const note = await one(
    `INSERT INTO notes (session_id, round_id, version_id, author_id, note_type_id, surah, ayah, timestamp_sec, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [session.id, round.id, round.version_id, req.user!.id, b.note_type_id, b.surah, b.ayah, b.timestamp_sec, b.body],
  );
  await audit(req.user!.id, 'note_added', 'session', session.id, { note_id: note.id }, undefined, req);
  res.status(201).json({ note });
}

export async function updateNote(req: Request, res: Response) {
  const noteId = Number(req.params.id);
  const note = await one('SELECT * FROM notes WHERE id = $1', [noteId]);
  if (!note) throw notFound('note_not_found');
  await openRoundForReviewer(note.round_id, req.user!.id);
  const session = await sessionWithProject(note.session_id);
  const b = req.body as Partial<{ note_type_id: number; surah: number; ayah: number; timestamp_sec: number; body: string }>;
  if (b.surah !== undefined || b.ayah !== undefined) await assertAyahInRange(session, b.surah ?? note.surah, b.ayah ?? note.ayah);
  const updated = await one(
    `UPDATE notes SET note_type_id = COALESCE($2, note_type_id), surah = COALESCE($3, surah), ayah = COALESCE($4, ayah),
       timestamp_sec = COALESCE($5, timestamp_sec), body = COALESCE($6, body) WHERE id = $1 RETURNING *`,
    [noteId, b.note_type_id ?? null, b.surah ?? null, b.ayah ?? null, b.timestamp_sec ?? null, b.body ?? null],
  );
  res.json({ note: updated });
}

/** A reviewer may delete a draft note only while the round is still open (before Submit). */
export async function deleteNote(req: Request, res: Response) {
  const noteId = Number(req.params.id);
  const note = await one('SELECT * FROM notes WHERE id = $1', [noteId]);
  if (!note) throw notFound('note_not_found');
  await openRoundForReviewer(note.round_id, req.user!.id);
  await query('DELETE FROM notes WHERE id = $1', [noteId]);
  await audit(req.user!.id, 'note_deleted', 'session', note.session_id, { note_id: noteId }, undefined, req);
  res.json({ ok: true });
}

export async function submit(req: Request, res: Response) {
  const roundId = Number(req.params.id);
  const result = await tx(async (db) => {
    const r = await submitRound(db, roundId, req.user!.id);
    await audit(req.user!.id, 'round_submitted', 'round', roundId, r, db, req);
    return r;
  });
  res.json(result);
}

// --------------------------------------------------------------------------
// Mujiz decisions, pass, extra round, PM forward (DEC-02..06, REV-07)
// --------------------------------------------------------------------------
export async function decide(req: Request, res: Response) {
  const noteId = Number(req.params.id);
  const note = await one('SELECT session_id FROM notes WHERE id = $1', [noteId]);
  if (!note) throw notFound('note_not_found');
  const { access } = await loadSessionAccess(req, note.session_id);
  if (!access.teamRoles.includes('mujiz')) throw forbidden('only_main_mujiz_decides'); // BR-08
  const { decision, comment } = req.body as { decision: 'accept' | 'reject' | 'studio' | 'technician'; comment: string | null };
  const r = await tx(async (db) => {
    const out = await decideNote(db, noteId, decision, comment, req.user!.id);
    await audit(req.user!.id, 'note_decided', 'note', noteId, { decision, comment }, db, req);
    return out;
  });
  res.json(r);
}

export async function pass(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { access } = await loadSessionAccess(req, id);
  if (!access.teamRoles.includes('technician') && !isManagement(req.user)) throw forbidden();
  await tx(async (db) => {
    await passSession(db, id, req.user!.id);
    await audit(req.user!.id, 'session_passed', 'session', id, null, db, req);
  });
  res.json({ ok: true });
}

export async function extraRound(req: Request, res: Response) {
  const id = Number(req.params.id);
  await loadSessionAccess(req, id);
  const { reviewer_id } = req.body as { reviewer_id: number };
  const reviewer = await one("SELECT id FROM users WHERE id = $1 AND is_active AND roles && '{reviewer,mujiz,technician}'::user_role[]", [reviewer_id]);
  if (!reviewer) throw badRequest('invalid_reviewer');
  const round = await tx(async (db) => {
    const r = await addExtraRound(db, id, reviewer_id, req.user!.id);
    await audit(req.user!.id, 'extra_round_added', 'session', id, { reviewer_id, round_id: r.id }, db, req);
    return r;
  });
  res.status(201).json({ round });
}

export async function forward(req: Request, res: Response) {
  const id = Number(req.params.id);
  await loadSessionAccess(req, id);
  await tx(async (db) => {
    await forwardFinalNotes(db, id, req.user!.id);
    await audit(req.user!.id, 'final_notes_forwarded', 'session', id, null, db, req);
  });
  res.json({ ok: true });
}

// --------------------------------------------------------------------------
// Corrections (DEC-05, BR-12)
// --------------------------------------------------------------------------
export async function updateCorrection(req: Request, res: Response) {
  const id = Number(req.params.id);
  const c = await one('SELECT * FROM corrections WHERE id = $1', [id]);
  if (!c) throw notFound('correction_not_found');
  const { access } = await loadSessionAccess(req, c.session_id);
  if (!access.teamRoles.includes('technician') && !access.teamRoles.includes('mixing_lead')) throw forbidden();
  const b = req.body as { is_rerecord: boolean; ayah_from: number; ayah_to: number };
  if (b.ayah_from > b.ayah_to) throw badRequest('invalid_ayah_range');
  const s = await one('SELECT ayah_count FROM surahs WHERE number = $1', [c.surah]);
  if (b.ayah_to > s.ayah_count) throw badRequest('invalid_ayah');
  const updated = await one('UPDATE corrections SET is_rerecord = $2, ayah_from = $3, ayah_to = $4 WHERE id = $1 RETURNING *', [id, b.is_rerecord, b.ayah_from, b.ayah_to]);
  await audit(req.user!.id, 'correction_updated', 'correction', id, b, undefined, req);
  res.json({ correction: updated });
}

export async function verifyCorrection(req: Request, res: Response) {
  const id = Number(req.params.id);
  const c = await one('SELECT * FROM corrections WHERE id = $1', [id]);
  if (!c) throw notFound('correction_not_found');
  const { access } = await loadSessionAccess(req, c.session_id);
  if (!access.teamRoles.includes('mujiz')) throw forbidden('only_main_mujiz_verifies');
  if (c.status !== 'done') throw conflict('correction_not_done');
  const updated = await one("UPDATE corrections SET status = 'verified', verified_by = $2, verified_at = now() WHERE id = $1 RETURNING *", [id, req.user!.id]);
  await audit(req.user!.id, 'correction_verified', 'correction', id, null, undefined, req);
  res.json({ correction: updated });
}
