/**
 * Workflow engine (section 8 "Target workflow").
 *
 * Per session (repeats for every session):
 *   pending --technician check-in--> editing --upload--> in_review(first)
 *   in_review --submit "no notes"--> awaiting_pass | next round (setting auto_pass_no_notes)
 *   in_review --submit notes--> in_decision (mujiz) [technical notes may go straight to technician]
 *   in_decision --all decided--> in_corrections (if accepted notes) | awaiting_pass/next round
 *   in_corrections --technician uploads corrected version--> next round
 *   after the last template round (first, second, technical) --> ready_for_mixing
 * Whole mushaf:
 *   all sessions ready_for_mixing (BR-10) --> project "mixing"; mixing lead uploads mixed --> session "mixed"
 *   production manager splits final review (REV-08) --> in_review(final) on mixed versions
 *   final notes --> pm_forward --> in_decision --> in_corrections --> corrected mixed replaces in place --> done
 *   all sessions done --> project "distribution" --> completed
 * Every transition is timestamped in session_events (TMR-04).
 */
import type pg from 'pg';
import { many, one, query } from '../config/db.js';
import { badRequest, conflict } from '../utils/http.js';
import { completeTimers, startTimer } from './timers.service.js';
import { getSettings } from './settings.service.js';
import { notify, usersWithRoles } from './notifications.service.js';
import { currentTeam, mixingLeadsFor } from './access.service.js';

type Client = pg.PoolClient;

export type Stage =
  | 'pending' | 'editing' | 'in_review' | 'awaiting_pass' | 'pm_forward' | 'in_decision'
  | 'in_corrections' | 'ready_for_mixing' | 'mixed' | 'done';

export async function setStage(db: Client, session: any, to: Stage, action: string, actorId: number | null, details: Record<string, unknown> | null = null) {
  await query(
    'UPDATE sessions SET stage = $2, stage_entered_at = now() WHERE id = $1',
    [session.id, to],
    db,
  );
  await query(
    'INSERT INTO session_events (session_id, from_stage, to_stage, action, actor_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
    [session.id, session.stage, to, action, actorId, details],
    db,
  );
  session.stage = to;
}

async function lockSession(db: Client, sessionId: number) {
  const s = await one('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [sessionId], db);
  if (!s) throw badRequest('session_not_found');
  return s;
}

async function templateRounds(db: Client, projectId: number): Promise<string[]> {
  const r = await one<{ rounds: string }>(
    'SELECT t.review_rounds::text[] AS rounds FROM projects p JOIN templates t ON t.id = p.template_id WHERE p.id = $1',
    [projectId],
    db,
  );
  const raw: unknown = r?.rounds;
  if (Array.isArray(raw)) return raw;
  return String(raw ?? '').replace(/^{|}$/g, '').split(',').filter(Boolean);
}

export async function approvedVersion(db: Client, sessionId: number, kind: 'raw' | 'mixed') {
  return one('SELECT * FROM versions WHERE session_id = $1 AND kind = $2 AND is_approved', [sessionId, kind], db);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** PRJ-02: approval creates the session slots (60 hizb ranges for a mushaf). */
export async function approveProject(db: Client, projectId: number, actorId: number) {
  const p = await one('SELECT p.*, t.uses_hizb_ranges FROM projects p JOIN templates t ON t.id = p.template_id WHERE p.id = $1 FOR UPDATE OF p', [projectId], db);
  if (!p) throw badRequest('project_not_found');
  if (p.status !== 'pending_approval') throw conflict('project_already_approved');
  if (p.uses_hizb_ranges) {
    await query(
      `INSERT INTO sessions (project_id, number, start_surah, start_ayah, end_surah, end_ayah)
       SELECT $1, number, start_surah, start_ayah, end_surah, end_ayah FROM hizbs WHERE number <= $2 ORDER BY number`,
      [projectId, p.session_count],
      db,
    );
  } else {
    await query(
      'INSERT INTO sessions (project_id, number) SELECT $1, g FROM generate_series(1, $2::int) AS g',
      [projectId, p.session_count],
      db,
    );
  }
  await query("UPDATE projects SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1", [projectId, actorId], db);
  const team = await currentTeam(projectId, db);
  const managers = await usersWithRoles(['production_manager'], db);
  await notify([...managers, p.reader_id, ...Object.values(team).flat() as number[]], {
    kind: 'project_approved', params: { project: p.title }, link: `/projects/${projectId}`, projectId,
  }, db);
}

/** BR-01: a project cannot start until the full team is assigned. MIX-01: notify mixing lead. */
export async function startProject(db: Client, projectId: number, actorId: number) {
  const p = await one('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [projectId], db);
  if (!p) throw badRequest('project_not_found');
  if (p.status !== 'approved') throw conflict('project_not_in_approved_state');
  const team = await currentTeam(projectId, db);
  const missing = (['mujiz', 'technician', 'reviewer1', 'reviewer2'] as const).filter((r) => !team[r]);
  if (missing.length) throw badRequest('team_incomplete', 'Team is incomplete', { missing });
  if (!p.recording_weekdays?.length) throw badRequest('recording_days_required');
  await query("UPDATE projects SET status = 'recording', started_at = now(), updated_at = now() WHERE id = $1", [projectId], db);
  await query(
    "INSERT INTO quality_ratings (project_id, kind, requested_by) VALUES ($1, 'first', $2)",
    [projectId, actorId],
    db,
  );
  const leads = await mixingLeadsFor(projectId, db);
  await notify(leads, { kind: 'project_started_quality', params: { project: p.title }, link: `/projects/${projectId}`, projectId }, db);
  await notify([p.reader_id, team.mujiz, team.technician, team.reviewer1, team.reviewer2], {
    kind: 'project_started', params: { project: p.title }, link: `/projects/${projectId}`, projectId,
  }, db);
}

// ---------------------------------------------------------------------------
// Recording (from technician check-in, ATT-03)
// ---------------------------------------------------------------------------
export async function markSessionsRecorded(db: Client, projectId: number, sessionIds: number[], actorId: number) {
  const team = await currentTeam(projectId, db);
  const settings = await getSettings(db);
  for (const id of sessionIds) {
    const s = await lockSession(db, id);
    if (s.stage !== 'pending') continue;
    await query('UPDATE sessions SET recorded_at = now() WHERE id = $1', [id], db);
    await setStage(db, s, 'editing', 'recorded', actorId);
    await startTimer({ projectId, sessionId: id, stage: 'editing', assigneeId: team.technician ?? null }, db, settings);
  }
  const pending = await one<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE project_id = $1 AND stage = 'pending'", [projectId], db);
  if (pending && pending.n === 0) {
    await query('UPDATE projects SET recording_completed_at = COALESCE(recording_completed_at, now()) WHERE id = $1', [projectId], db);
  }
}

// ---------------------------------------------------------------------------
// Uploads (FIL-01..06)
// ---------------------------------------------------------------------------

/** Validates whether a version of `kind` may be uploaded now. Returns the upload reason. */
export async function assertUploadAllowed(db: Client, session: any, project: any, kind: 'raw' | 'mixed') {
  const round = session.current_round_id ? await one('SELECT * FROM review_rounds WHERE id = $1', [session.current_round_id], db) : null;
  const finalPhase = round?.round_type === 'final';
  if (kind === 'raw') {
    if (session.stage === 'editing') return 'initial';
    if (session.stage === 'in_corrections' && !finalPhase) return 'corrections';
    throw conflict('raw_upload_not_allowed_in_stage');
  }
  if (session.stage === 'ready_for_mixing' && project.status === 'mixing') return 'mixed';
  if (session.stage === 'mixed' && project.status === 'mixing') return 'remix';
  if (session.stage === 'in_corrections' && finalPhase) return 'final_corrections';
  throw conflict('mixed_upload_not_allowed_in_stage');
}

export async function registerVersion(
  db: Client,
  sessionId: number,
  kind: 'raw' | 'mixed',
  file: { relPath: string; originalName: string; mime: string; size: number },
  reason: string,
  actorId: number,
) {
  const next = await one<{ n: number }>(
    'SELECT COALESCE(max(version_no), 0) + 1 AS n FROM versions WHERE session_id = $1 AND kind = $2',
    [sessionId, kind],
    db,
  );
  await query('UPDATE versions SET is_approved = FALSE WHERE session_id = $1 AND kind = $2 AND is_approved', [sessionId, kind], db);
  return one(
    `INSERT INTO versions (session_id, kind, version_no, file_path, original_name, mime_type, size_bytes, is_approved, upload_reason, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9) RETURNING *`,
    [sessionId, kind, next!.n, file.relPath, file.originalName, file.mime, file.size, reason, actorId],
    db,
  );
}

export async function nextVersionNo(db: Client, sessionId: number, kind: 'raw' | 'mixed') {
  const r = await one<{ n: number }>('SELECT COALESCE(max(version_no), 0) + 1 AS n FROM versions WHERE session_id = $1 AND kind = $2', [sessionId, kind], db);
  return r!.n;
}

/** Moves the workflow after a successful upload. */
export async function afterUpload(db: Client, sessionId: number, version: any, reason: string, actorId: number) {
  const s = await lockSession(db, sessionId);
  const project = await one('SELECT * FROM projects WHERE id = $1', [s.project_id], db);
  if (reason === 'initial') {
    await completeTimers({ sessionId: s.id, stage: 'editing' }, db);
    await attachFirstQualitySample(db, s, version);
    await maybeRandomQualitySample(db, s.project_id);
    await startNextRound(db, s, actorId);
  } else if (reason === 'corrections' || reason === 'final_corrections') {
    await query(
      "UPDATE corrections SET status = 'done', done_by = $2, done_at = now(), done_version_id = $3 WHERE session_id = $1 AND status = 'open'",
      [s.id, actorId, version.id],
      db,
    );
    await completeTimers({ sessionId: s.id, stage: 'corrections' }, db);
    if (reason === 'final_corrections') {
      // FIL-06: the corrected session replaces the old one in place (history kept in versions)
      await query('UPDATE sessions SET mixed_at = now(), done_at = now() WHERE id = $1', [s.id], db);
      await setStage(db, s, 'done', 'final_corrections_uploaded', actorId, { version_id: version.id });
      await checkProjectDone(db, project, actorId);
    } else {
      await setStage(db, s, s.stage, 'corrections_uploaded', actorId, { version_id: version.id });
      await advance(db, s, actorId);
    }
  } else if (reason === 'mixed' || reason === 'remix') {
    await query('UPDATE sessions SET mixed_at = now() WHERE id = $1', [s.id], db);
    if (s.stage !== 'mixed') await setStage(db, s, 'mixed', 'mixed_uploaded', actorId, { version_id: version.id });
    await checkAllMixed(db, project);
  }
}

async function attachFirstQualitySample(db: Client, session: any, version: any) {
  const q = await one(
    "UPDATE quality_ratings SET session_id = $2, version_id = $3, requested_at = now() WHERE project_id = $1 AND kind = 'first' AND session_id IS NULL RETURNING *",
    [session.project_id, session.id, version.id],
    db,
  );
  if (!q) return;
  const leads = await mixingLeadsFor(session.project_id, db);
  await startTimer({ projectId: session.project_id, sessionId: session.id, qualityRatingId: q.id, stage: 'quality_rating', assigneeId: leads[0] ?? null }, db);
  await notify(leads, { kind: 'quality_sample_ready', params: { session: session.number }, link: `/sessions/${session.id}`, projectId: session.project_id }, db);
}

/**
 * MIX-02: "later pick a random session to rate recording and editing". Once the configured
 * number of sessions has been uploaded, the system picks one at random (once per project);
 * management or the mixing lead can also request more samples on demand.
 */
async function maybeRandomQualitySample(db: Client, projectId: number) {
  const s = await getSettings(db);
  const uploaded = await one<{ n: number }>(
    "SELECT count(DISTINCT session_id)::int AS n FROM versions v JOIN sessions x ON x.id = v.session_id WHERE x.project_id = $1 AND v.kind = 'raw'",
    [projectId],
    db,
  );
  if (!uploaded || uploaded.n < s.random_quality_after_session) return;
  const existing = await one("SELECT 1 FROM quality_ratings WHERE project_id = $1 AND kind = 'random'", [projectId], db);
  if (existing) return;
  const pick = await one(
    `SELECT x.id, x.number, v.id AS version_id FROM sessions x JOIN versions v ON v.session_id = x.id AND v.kind = 'raw' AND v.is_approved
     WHERE x.project_id = $1 AND NOT EXISTS (SELECT 1 FROM quality_ratings q WHERE q.session_id = x.id)
     ORDER BY random() LIMIT 1`,
    [projectId],
    db,
  );
  if (!pick) return;
  const q = await one(
    "INSERT INTO quality_ratings (project_id, session_id, version_id, kind) VALUES ($1,$2,$3,'random') RETURNING *",
    [projectId, pick.id, pick.version_id],
    db,
  );
  const leads = await mixingLeadsFor(projectId, db);
  await startTimer({ projectId, sessionId: pick.id, qualityRatingId: q.id, stage: 'quality_rating', assigneeId: leads[0] ?? null }, db);
  await notify(leads, { kind: 'quality_sample_ready', params: { session: pick.number }, link: `/sessions/${pick.id}`, projectId }, db);
}

// ---------------------------------------------------------------------------
// Review rounds (REV-01, REV-06, REV-07)
// ---------------------------------------------------------------------------
const ROUND_SEAT: Record<string, 'reviewer1' | 'reviewer2' | 'technician'> = {
  first: 'reviewer1',
  second: 'reviewer2',
  technical: 'technician',
};

export async function startRound(
  db: Client,
  session: any,
  roundType: 'first' | 'second' | 'technical' | 'extra' | 'final',
  reviewerId: number,
  versionId: number,
  actorId: number | null,
  finalAssignmentId: number | null = null,
) {
  const no = await one<{ n: number }>('SELECT COALESCE(max(round_no), 0) + 1 AS n FROM review_rounds WHERE session_id = $1', [session.id], db);
  const round = await one(
    `INSERT INTO review_rounds (session_id, version_id, round_type, round_no, reviewer_id, final_assignment_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [session.id, versionId, roundType, no!.n, reviewerId, finalAssignmentId],
    db,
  );
  await query('UPDATE sessions SET current_round_id = $2 WHERE id = $1', [session.id, round.id], db);
  session.current_round_id = round.id;
  await setStage(db, session, 'in_review', `round_started_${roundType}`, actorId, { round_id: round.id, reviewer_id: reviewerId });
  await startTimer({ projectId: session.project_id, sessionId: session.id, roundId: round.id, stage: 'review', assigneeId: reviewerId }, db);
  await notify([reviewerId], {
    kind: 'review_assigned', params: { session: session.number, round: roundType }, link: `/sessions/${session.id}`, projectId: session.project_id,
  }, db);
  return round;
}

/** Starts the next template round on the approved raw version, or marks the session ready for mixing. */
async function startNextRound(db: Client, session: any, actorId: number | null) {
  const rounds = await templateRounds(db, session.project_id);
  const idx = session.next_round_index as number;
  if (idx >= rounds.length) {
    await query('UPDATE sessions SET ready_for_mixing_at = now(), current_round_id = NULL WHERE id = $1', [session.id], db);
    await setStage(db, session, 'ready_for_mixing', 'raw_ready', actorId);
    await checkAllReady(db, session.project_id, actorId);
    return;
  }
  const type = rounds[idx] as 'first' | 'second' | 'technical';
  const team = await currentTeam(session.project_id, db);
  const reviewer = team[ROUND_SEAT[type]];
  if (!reviewer) throw badRequest('team_incomplete');
  const version = await approvedVersion(db, session.id, 'raw');
  if (!version) throw conflict('no_approved_version');
  await query('UPDATE sessions SET next_round_index = next_round_index + 1 WHERE id = $1', [session.id], db);
  session.next_round_index = idx + 1;
  await startRound(db, session, type, reviewer, version.id, actorId);
}

/** Moves on after a round produced nothing to fix (or corrections were uploaded). */
export async function advance(db: Client, session: any, actorId: number | null) {
  const round = session.current_round_id ? await one('SELECT * FROM review_rounds WHERE id = $1', [session.current_round_id], db) : null;
  if (round?.round_type === 'final') {
    await query('UPDATE sessions SET done_at = now() WHERE id = $1', [session.id], db);
    await setStage(db, session, 'done', 'final_review_passed', actorId);
    const project = await one('SELECT * FROM projects WHERE id = $1', [session.project_id], db);
    await checkProjectDone(db, project, actorId);
    return;
  }
  await startNextRound(db, session, actorId);
}

async function nothingToFix(db: Client, session: any, actorId: number | null) {
  const s = await getSettings(db);
  if (s.auto_pass_no_notes) {
    await advance(db, session, actorId);
  } else {
    await setStage(db, session, 'awaiting_pass', 'awaiting_one_click_pass', actorId);
    const team = await currentTeam(session.project_id, db);
    await notify([team.technician], { kind: 'session_awaiting_pass', params: { session: session.number }, link: `/sessions/${session.id}`, projectId: session.project_id }, db);
  }
}

/** REV-06: submit a round with "no notes" or with the notes written. */
export async function submitRound(db: Client, roundId: number, actorId: number) {
  const round = await one('SELECT * FROM review_rounds WHERE id = $1 FOR UPDATE', [roundId], db);
  if (!round) throw badRequest('round_not_found');
  if (round.status !== 'open') throw conflict('round_already_submitted');
  if (round.reviewer_id !== actorId) throw badRequest('not_round_reviewer');
  const session = await lockSession(db, round.session_id);
  if (session.current_round_id !== round.id || session.stage !== 'in_review') throw conflict('round_not_current');

  const notes = await many('SELECT n.*, t.is_technical FROM notes n JOIN note_types t ON t.id = n.note_type_id WHERE n.round_id = $1', [round.id], db);
  const result = notes.length ? 'notes' : 'no_notes';
  await query("UPDATE review_rounds SET status = 'submitted', result = $2, submitted_at = now() WHERE id = $1", [round.id, result], db);
  await completeTimers({ roundId: round.id, stage: 'review' }, db);
  await query(
    'INSERT INTO session_events (session_id, from_stage, to_stage, action, actor_id, details) VALUES ($1,$2,$2,$3,$4,$5)',
    [session.id, session.stage, 'round_submitted', actorId, { round_id: round.id, result, notes: notes.length }],
    db,
  );

  if (!notes.length) {
    await nothingToFix(db, session, actorId);
    return { result };
  }

  if (round.round_type === 'final') {
    // Final review notes go to the production manager, then the mujiz (section 8, step 11)
    await setStage(db, session, 'pm_forward', 'final_notes_to_pm', actorId);
    const managers = await usersWithRoles(['production_manager'], db);
    await notify(managers, { kind: 'final_notes_received', params: { session: session.number, count: notes.length }, link: `/sessions/${session.id}`, projectId: session.project_id }, db);
    return { result };
  }

  await routeNotesToMujiz(db, session, notes, actorId);
  return { result };
}

/** DEC-04: technical notes may go straight to the technician (setting). */
async function routeNotesToMujiz(db: Client, session: any, notes: any[], actorId: number | null) {
  const s = await getSettings(db);
  const team = await currentTeam(session.project_id, db);
  let pendingForMujiz = 0;
  for (const n of notes) {
    if (s.technical_notes_to_technician && n.is_technical) {
      await query("UPDATE notes SET routed_to_technician = TRUE, current_decision = 'technician', decided_at = now() WHERE id = $1", [n.id], db);
      await createCorrection(db, n);
    } else {
      pendingForMujiz++;
    }
  }
  if (pendingForMujiz > 0) {
    await setStage(db, session, 'in_decision', 'notes_to_mujiz', actorId, { notes: pendingForMujiz });
    await startTimer({ projectId: session.project_id, sessionId: session.id, stage: 'decision', assigneeId: team.mujiz ?? null }, db);
    await notify([team.mujiz], { kind: 'notes_awaiting_decision', params: { session: session.number, count: pendingForMujiz }, link: `/sessions/${session.id}`, projectId: session.project_id }, db);
  } else {
    await afterDecisionsComplete(db, session, actorId);
  }
}

/** Production manager forwards final-review notes to the mujiz. */
export async function forwardFinalNotes(db: Client, sessionId: number, actorId: number) {
  const session = await lockSession(db, sessionId);
  if (session.stage !== 'pm_forward') throw conflict('nothing_to_forward');
  await query('UPDATE notes SET forwarded_by = $2, forwarded_at = now() WHERE round_id = $1', [session.current_round_id, actorId], db);
  const notes = await many('SELECT n.*, t.is_technical FROM notes n JOIN note_types t ON t.id = n.note_type_id WHERE n.round_id = $1', [session.current_round_id], db);
  await routeNotesToMujiz(db, session, notes, actorId);
}

// ---------------------------------------------------------------------------
// Mujiz decisions (DEC-01..06, BR-08)
// ---------------------------------------------------------------------------
async function createCorrection(db: Client, note: any) {
  await query(
    `INSERT INTO corrections (note_id, session_id, surah, ayah_from, ayah_to)
     VALUES ($1, $2, $3, $4, $4) ON CONFLICT (note_id) DO NOTHING`,
    [note.id, note.session_id, note.surah, note.ayah],
    db,
  );
}

export async function decideNote(db: Client, noteId: number, decision: 'accept' | 'reject' | 'studio' | 'technician', comment: string | null, actorId: number) {
  const note = await one('SELECT * FROM notes WHERE id = $1 FOR UPDATE', [noteId], db);
  if (!note) throw badRequest('note_not_found');
  const session = await lockSession(db, note.session_id);
  if (session.stage !== 'in_decision') throw conflict('session_not_awaiting_decisions');
  if (note.round_id !== session.current_round_id) throw conflict('note_not_in_current_round');
  if (note.routed_to_technician) throw conflict('note_routed_to_technician');

  await query('INSERT INTO note_decisions (note_id, decision, comment, decided_by) VALUES ($1,$2,$3,$4)', [noteId, decision, comment, actorId], db);
  await query('UPDATE notes SET current_decision = $2, decided_at = now() WHERE id = $1', [noteId, decision], db);
  if (decision === 'accept' || decision === 'technician') {
    await createCorrection(db, note);
  } else {
    await query("DELETE FROM corrections WHERE note_id = $1 AND status = 'open'", [noteId], db);
  }

  // Are all notes of this round now decided? ('studio' = to be heard in the studio, still open)
  const open = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM notes WHERE round_id = $1 AND (current_decision IS NULL OR current_decision = 'studio')",
    [session.current_round_id],
    db,
  );
  if (open!.n === 0) {
    await completeTimers({ sessionId: session.id, stage: 'decision' }, db);
    await afterDecisionsComplete(db, session, actorId);
  }
  return { remaining: open!.n };
}

async function afterDecisionsComplete(db: Client, session: any, actorId: number | null) {
  const open = await many(
    `SELECT c.*, n.body, n.ayah FROM corrections c JOIN notes n ON n.id = c.note_id
     WHERE c.session_id = $1 AND c.status = 'open'`,
    [session.id],
    db,
  );
  if (!open.length) {
    // All notes rejected: the same version passes on (DEC-06)
    await nothingToFix(db, session, actorId);
    return;
  }
  const round = await one('SELECT * FROM review_rounds WHERE id = $1', [session.current_round_id], db);
  const team = await currentTeam(session.project_id, db);
  const finalPhase = round?.round_type === 'final';
  const assignee = finalPhase ? (await mixingLeadsFor(session.project_id, db))[0] ?? team.technician : team.technician;
  await setStage(db, session, 'in_corrections', 'corrections_required', actorId, { count: open.length });
  await startTimer({ projectId: session.project_id, sessionId: session.id, stage: 'corrections', assigneeId: assignee ?? null }, db);
  // DEC-03: notify the technician of accepted notes
  const recipients = finalPhase ? [team.technician, ...(await mixingLeadsFor(session.project_id, db))] : [team.technician];
  await notify(recipients, { kind: 'corrections_required', params: { session: session.number, count: open.length }, link: `/sessions/${session.id}`, projectId: session.project_id }, db);
}

/** One-click pass for a session with no corrections (DEC-06). */
export async function passSession(db: Client, sessionId: number, actorId: number) {
  const session = await lockSession(db, sessionId);
  if (session.stage !== 'awaiting_pass') throw conflict('session_not_awaiting_pass');
  await advance(db, session, actorId);
}

/** REV-07: extra review round on demand (production manager). */
export async function addExtraRound(db: Client, sessionId: number, reviewerId: number, actorId: number) {
  const session = await lockSession(db, sessionId);
  if (!['awaiting_pass', 'ready_for_mixing'].includes(session.stage)) throw conflict('extra_round_not_allowed_in_stage');
  const project = await one('SELECT status FROM projects WHERE id = $1', [session.project_id], db);
  if (session.stage === 'ready_for_mixing' && project.status !== 'recording') throw conflict('project_already_mixing');
  const version = await approvedVersion(db, session.id, 'raw');
  if (!version) throw conflict('no_approved_version');
  return startRound(db, session, 'extra', reviewerId, version.id, actorId);
}

// ---------------------------------------------------------------------------
// Mixing, final review, completion (MIX-04, REV-08, BR-10)
// ---------------------------------------------------------------------------
async function checkAllReady(db: Client, projectId: number, actorId: number | null) {
  const r = await one<{ total: number; ready: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE stage = 'ready_for_mixing')::int AS ready FROM sessions WHERE project_id = $1",
    [projectId],
    db,
  );
  if (!r || r.total === 0 || r.ready !== r.total) return;
  const p = await one("UPDATE projects SET status = 'mixing', mixing_started_at = now(), updated_at = now() WHERE id = $1 AND status = 'recording' RETURNING *", [projectId], db);
  if (!p) return;
  const leads = await mixingLeadsFor(projectId, db);
  await startTimer({ projectId, stage: 'mixing', assigneeId: leads[0] ?? null }, db);
  const managers = await usersWithRoles(['production_manager'], db);
  await notify([...leads, ...managers], { kind: 'project_ready_for_mixing', params: { project: p.title }, link: `/projects/${projectId}`, projectId }, db);
  void actorId;
}

async function checkAllMixed(db: Client, project: any) {
  const r = await one<{ total: number; mixed: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE stage = 'mixed')::int AS mixed FROM sessions WHERE project_id = $1",
    [project.id],
    db,
  );
  if (!r || r.mixed !== r.total) return;
  await completeTimers({ projectId: project.id, stage: 'mixing' }, db);
  const managers = await usersWithRoles(['production_manager'], db);
  await notify(managers, { kind: 'project_mixed', params: { project: project.title }, link: `/projects/${project.id}`, projectId: project.id }, db);
}

/** REV-08: split the final review across reviewers, ensuring every session is covered. */
export async function startFinalReview(
  db: Client,
  projectId: number,
  parts: { reviewerId: number; from: number; to: number }[],
  splitLabel: string,
  actorId: number,
) {
  const p = await one('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [projectId], db);
  if (!p) throw badRequest('project_not_found');
  if (p.status !== 'mixing') throw conflict('project_not_in_mixing');
  const stats = await one<{ total: number; mixed: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE stage = 'mixed')::int AS mixed FROM sessions WHERE project_id = $1",
    [projectId],
    db,
  );
  if (stats!.mixed !== stats!.total) throw conflict('not_all_sessions_mixed');
  // coverage check: ranges sorted, contiguous, 1..N
  const sorted = [...parts].sort((a, b) => a.from - b.from);
  let expected = 1;
  for (const part of sorted) {
    if (part.from !== expected || part.to < part.from) throw badRequest('final_split_not_contiguous');
    expected = part.to + 1;
  }
  if (expected !== p.session_count + 1) throw badRequest('final_split_incomplete');

  for (const part of sorted) {
    const reviewer = await one("SELECT id FROM users WHERE id = $1 AND is_active AND 'reviewer' = ANY(roles)", [part.reviewerId], db);
    if (!reviewer) throw badRequest('invalid_final_reviewer');
    const existing = await one(
      "SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 AND team_role = 'final_reviewer' AND removed_at IS NULL",
      [projectId, part.reviewerId],
      db,
    );
    if (!existing) {
      await query("INSERT INTO project_members (project_id, user_id, team_role, assigned_by) VALUES ($1,$2,'final_reviewer',$3)", [projectId, part.reviewerId, actorId], db);
    }
    const a = await one(
      'INSERT INTO final_review_assignments (project_id, reviewer_id, session_from, session_to, split_label, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [projectId, part.reviewerId, part.from, part.to, splitLabel, actorId],
      db,
    );
    const sessions = await many('SELECT * FROM sessions WHERE project_id = $1 AND number BETWEEN $2 AND $3 ORDER BY number FOR UPDATE', [projectId, part.from, part.to], db);
    for (const s of sessions) {
      const mixed = await approvedVersion(db, s.id, 'mixed');
      if (!mixed) throw conflict('no_mixed_version');
      // startRound notifies per session; keep it to one summary notification per reviewer instead
      const no = await one<{ n: number }>('SELECT COALESCE(max(round_no), 0) + 1 AS n FROM review_rounds WHERE session_id = $1', [s.id], db);
      const round = await one(
        `INSERT INTO review_rounds (session_id, version_id, round_type, round_no, reviewer_id, final_assignment_id)
         VALUES ($1,$2,'final',$3,$4,$5) RETURNING *`,
        [s.id, mixed.id, no!.n, part.reviewerId, a.id],
        db,
      );
      await query('UPDATE sessions SET current_round_id = $2 WHERE id = $1', [s.id, round.id], db);
      s.current_round_id = round.id;
      await setStage(db, s, 'in_review', 'round_started_final', actorId, { round_id: round.id, reviewer_id: part.reviewerId });
      await startTimer({ projectId, sessionId: s.id, roundId: round.id, stage: 'review', assigneeId: part.reviewerId }, db);
    }
    await notify([part.reviewerId], { kind: 'final_review_assigned', params: { project: p.title, from: part.from, to: part.to }, link: `/projects/${projectId}`, projectId }, db);
  }
  await query("UPDATE projects SET status = 'final_review', final_review_started_at = now(), updated_at = now() WHERE id = $1", [projectId], db);
}

async function checkProjectDone(db: Client, project: any, actorId: number | null) {
  const r = await one<{ total: number; done: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE stage = 'done')::int AS done FROM sessions WHERE project_id = $1",
    [project.id],
    db,
  );
  if (!r || r.done !== r.total) return;
  const p = await one("UPDATE projects SET status = 'distribution', updated_at = now() WHERE id = $1 AND status = 'final_review' RETURNING *", [project.id], db);
  if (!p) return;
  const managers = await usersWithRoles(['production_manager', 'admin'], db);
  await notify([...managers, p.reader_id], { kind: 'project_ready_for_distribution', params: { project: p.title }, link: `/projects/${p.id}`, projectId: p.id }, db);
  void actorId;
}
