/**
 * Recording quality (MIX-01..03), mixing (MIX-04), final review split (REV-08)
 * and the distribution log (DST-01, light phase 2).
 */
import path from 'node:path';
import archiver from 'archiver';
import type { Request, Response } from 'express';
import { many, one, query, tx } from '../config/db.js';
import { isManagement } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
import { assertProjectView, mixingLeadsFor } from '../services/access.service.js';
import { absolute } from '../services/audio.service.js';
import { notify, usersWithRoles } from '../services/notifications.service.js';
import { completeTimers, startTimer } from '../services/timers.service.js';
import { startFinalReview } from '../services/workflow.service.js';
import { badRequest, conflict, forbidden, notFound, safeFileName } from '../utils/http.js';

// --------------------------------------------------------------------------
// Quality samples
// --------------------------------------------------------------------------
export async function listQuality(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  await assertProjectView(req.user!, projectId);
  const rows = await many(
    `SELECT q.*, s.number AS session_number, v.version_no, rb.full_name AS rated_by_name, qb.full_name AS requested_by_name
     FROM quality_ratings q LEFT JOIN sessions s ON s.id = q.session_id LEFT JOIN versions v ON v.id = q.version_id
     LEFT JOIN users rb ON rb.id = q.rated_by LEFT JOIN users qb ON qb.id = q.requested_by
     WHERE q.project_id = $1 ORDER BY q.requested_at`,
    [projectId],
  );
  res.json({ ratings: rows });
}

/** MIX-02: pick a random uploaded session for a recording/editing rating. */
export async function requestRandomSample(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const access = await assertProjectView(req.user!, projectId);
  if (!access.isManagement && !access.teamRoles.includes('mixing_lead')) throw forbidden();
  const q = await tx(async (db) => {
    const pick = await one(
      `SELECT s.id, s.number, v.id AS version_id FROM sessions s JOIN versions v ON v.session_id = s.id AND v.kind = 'raw' AND v.is_approved
       WHERE s.project_id = $1 AND NOT EXISTS (SELECT 1 FROM quality_ratings q WHERE q.session_id = s.id)
       ORDER BY random() LIMIT 1`,
      [projectId],
      db,
    );
    if (!pick) throw conflict('no_session_available_for_sample');
    const row = await one(
      "INSERT INTO quality_ratings (project_id, session_id, version_id, kind, requested_by) VALUES ($1,$2,$3,'random',$4) RETURNING *",
      [projectId, pick.id, pick.version_id, req.user!.id],
      db,
    );
    const leads = await mixingLeadsFor(projectId, db);
    await startTimer({ projectId, sessionId: pick.id, qualityRatingId: row.id, stage: 'quality_rating', assigneeId: leads[0] ?? null }, db);
    await notify(leads, { kind: 'quality_sample_ready', params: { session: pick.number }, link: `/sessions/${pick.id}`, projectId }, db);
    await audit(req.user!.id, 'quality_sample_requested', 'project', projectId, { session_id: pick.id }, db, req);
    return row;
  });
  res.status(201).json({ rating: q });
}

/** MIX-03: approve with a tick, or "not suitable" with notes. */
export async function rateQuality(req: Request, res: Response) {
  const id = Number(req.params.id);
  const q = await one('SELECT * FROM quality_ratings WHERE id = $1', [id]);
  if (!q) throw notFound('rating_not_found');
  const access = await assertProjectView(req.user!, q.project_id);
  if (!access.teamRoles.includes('mixing_lead')) throw forbidden('mixing_lead_only');
  if (!q.session_id) throw conflict('sample_not_available_yet');
  if (q.verdict) throw conflict('already_rated');
  const { verdict, notes } = req.body as { verdict: 'approved' | 'not_suitable'; notes: string | null };
  if (verdict === 'not_suitable' && !notes) throw badRequest('notes_required_when_not_suitable');
  const updated = await tx(async (db) => {
    const r = await one('UPDATE quality_ratings SET verdict = $2, notes = $3, rated_by = $4, rated_at = now() WHERE id = $1 RETURNING *', [id, verdict, notes, req.user!.id], db);
    await completeTimers({ qualityRatingId: id, stage: 'quality_rating' }, db);
    await audit(req.user!.id, 'quality_rated', 'quality_rating', id, { verdict }, db, req);
    if (verdict === 'not_suitable') {
      const managers = await usersWithRoles(['production_manager'], db);
      await notify([...managers], { kind: 'quality_not_suitable', params: { project: access.project.title }, link: `/projects/${q.project_id}`, projectId: q.project_id }, db);
    }
    return r;
  });
  res.json({ rating: updated });
}

// --------------------------------------------------------------------------
// Mixing (MIX-04): pull all approved raw sessions from the system
// --------------------------------------------------------------------------
export async function rawArchive(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const access = await assertProjectView(req.user!, projectId);
  if (!access.teamRoles.includes('mixing_lead') && !access.isManagement) throw forbidden();
  if (!['mixing', 'final_review', 'distribution', 'completed'].includes(access.project.status)) throw conflict('project_not_ready_for_mixing'); // BR-10
  const files = await many(
    `SELECT s.number, v.file_path FROM sessions s JOIN versions v ON v.session_id = s.id AND v.kind = 'raw' AND v.is_approved
     WHERE s.project_id = $1 ORDER BY s.number`,
    [projectId],
  );
  await audit(req.user!.id, 'raw_archive_downloaded', 'project', projectId, { files: files.length }, undefined, req);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="raw.zip"; filename*=UTF-8''${encodeURIComponent(`${safeFileName(access.project.title)} - raw.zip`)}`);
  const zip = archiver('zip', { store: true });
  zip.on('error', (err) => res.destroy(err));
  zip.pipe(res);
  for (const f of files) zip.file(absolute(f.file_path), { name: `${String(f.number).padStart(2, '0')}${path.extname(f.file_path)}` });
  await zip.finalize();
}

// --------------------------------------------------------------------------
// Final review split (REV-08)
// --------------------------------------------------------------------------
export async function finalReview(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const { split, parts } = req.body as { split: string; parts: { reviewer_id: number; from: number; to: number }[] };
  await tx(async (db) => {
    await startFinalReview(db, projectId, parts.map((p) => ({ reviewerId: p.reviewer_id, from: p.from, to: p.to })), split, req.user!.id);
    await audit(req.user!.id, 'final_review_started', 'project', projectId, { split, parts }, db, req);
  });
  res.status(201).json({ ok: true });
}

export async function finalAssignments(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  await assertProjectView(req.user!, projectId);
  const rows = await many(
    `SELECT a.*, u.full_name AS reviewer_name,
       (SELECT count(*)::int FROM review_rounds r WHERE r.final_assignment_id = a.id AND r.status = 'submitted') AS submitted,
       (SELECT count(*)::int FROM review_rounds r WHERE r.final_assignment_id = a.id) AS total
     FROM final_review_assignments a JOIN users u ON u.id = a.reviewer_id WHERE a.project_id = $1 ORDER BY a.session_from`,
    [projectId],
  );
  res.json({ assignments: rows });
}

// --------------------------------------------------------------------------
// Distribution log (DST-01)
// --------------------------------------------------------------------------
export async function listDistributions(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  await assertProjectView(req.user!, projectId);
  const rows = await many(
    'SELECT d.*, u.full_name AS created_by_name FROM distributions d JOIN users u ON u.id = d.created_by WHERE d.project_id = $1 ORDER BY d.delivered_on DESC, d.id DESC',
    [projectId],
  );
  res.json({ distributions: rows });
}

export async function addDistribution(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const access = await assertProjectView(req.user!, projectId);
  if (!isManagement(req.user)) throw forbidden();
  if (!['distribution', 'completed'].includes(access.project.status)) throw conflict('project_not_ready_for_distribution');
  const b = req.body as { recipient: string; channel: string; country: string | null; city: string | null; output_version: string | null; delivered_on: string; notes: string | null; feedback: string | null };
  const d = await one(
    `INSERT INTO distributions (project_id, recipient, channel, country, city, output_version, delivered_on, notes, feedback, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [projectId, b.recipient, b.channel, b.country, b.city, b.output_version, b.delivered_on, b.notes, b.feedback, req.user!.id],
  );
  await audit(req.user!.id, 'distribution_logged', 'project', projectId, { distribution_id: d.id, recipient: b.recipient }, undefined, req);
  res.status(201).json({ distribution: d });
}

export async function updateDistribution(req: Request, res: Response) {
  const id = Number(req.params.id);
  const b = req.body as Partial<{ recipient: string; channel: string; country: string | null; city: string | null; output_version: string | null; delivered_on: string; notes: string | null; feedback: string | null }>;
  const keys = Object.keys(b) as (keyof typeof b)[];
  if (!keys.length) throw badRequest('nothing_to_update');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const d = await one(`UPDATE distributions SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => b[k])]);
  if (!d) throw notFound('distribution_not_found');
  await audit(req.user!.id, 'distribution_updated', 'distribution', id, b as Record<string, unknown>, undefined, req);
  res.json({ distribution: d });
}

export async function deleteDistribution(req: Request, res: Response) {
  const id = Number(req.params.id);
  const r = await query('DELETE FROM distributions WHERE id = $1', [id]);
  if (!r.rowCount) throw notFound('distribution_not_found');
  await audit(req.user!.id, 'distribution_deleted', 'distribution', id, null, undefined, req);
  res.json({ ok: true });
}
