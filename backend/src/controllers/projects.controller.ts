import type { Request, Response } from 'express';
import { many, one, query, tx } from '../config/db.js';
import { hasRole, isManagement } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
import { assertProjectView, currentTeam, type TeamRole } from '../services/access.service.js';
import { notify } from '../services/notifications.service.js';
import { approveProject, startProject } from '../services/workflow.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';

const PROJECT_COLS = `p.*, t.code AS template_code, t.uses_hizb_ranges, r.full_name AS reader_name`;

/** People see only their own projects; mujiz etc. do not see projects before approval. */
export async function listProjects(req: Request, res: Response) {
  const { status, type } = req.query as { status?: string; type?: string };
  const params: unknown[] = [];
  const conds: string[] = [];
  if (!isManagement(req.user)) {
    params.push(req.user!.id);
    conds.push(`(p.reader_id = $${params.length} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $${params.length} AND m.removed_at IS NULL)
      ${hasRole(req.user, 'mixing_lead') ? "OR NOT EXISTS (SELECT 1 FROM project_members m2 WHERE m2.project_id = p.id AND m2.team_role = 'mixing_lead' AND m2.removed_at IS NULL)" : ''})`);
    conds.push("p.status <> 'pending_approval'");
  }
  if (status) { params.push(status); conds.push(`p.status = $${params.length}`); }
  if (type) { params.push(type); conds.push(`p.project_type = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await many(
    `SELECT ${PROJECT_COLS},
       (SELECT count(*)::int FROM sessions s WHERE s.project_id = p.id AND s.stage <> 'pending') AS recorded_count,
       (SELECT count(*)::int FROM sessions s WHERE s.project_id = p.id AND s.stage IN ('ready_for_mixing','mixed','done')) AS ready_count,
       (SELECT count(*)::int FROM sessions s WHERE s.project_id = p.id AND s.stage = 'done') AS done_count,
       (SELECT COALESCE(max(alert_level),0) FROM stage_timers st WHERE st.project_id = p.id AND st.completed_at IS NULL) AS alert_level
     FROM projects p JOIN templates t ON t.id = p.template_id JOIN users r ON r.id = p.reader_id
     ${where} ORDER BY p.created_at DESC`,
    params,
  );
  res.json({ projects: rows });
}

/** PRJ-01: create a project (type, reader/announcer, riwayah). */
export async function createProject(req: Request, res: Response) {
  const b = req.body as {
    title: string; project_type: 'mushaf' | 'hadith' | 'recitation'; riwayah: string; reader_id: number;
    session_count?: number; recording_weekdays: number[]; sessions_per_day: number; description: string | null;
  };
  const template = await one('SELECT * FROM templates WHERE project_type = $1 ORDER BY id LIMIT 1', [b.project_type]);
  if (!template) throw badRequest('template_not_found');
  const sessionCount = template.fixed_session_count ?? b.session_count;
  if (!sessionCount) throw badRequest('session_count_required');
  const reader = await one("SELECT id FROM users WHERE id = $1 AND is_active AND 'reader' = ANY(roles)", [b.reader_id]);
  if (!reader) throw badRequest('invalid_reader');
  const p = await one(
    `INSERT INTO projects (title, project_type, template_id, riwayah, reader_id, session_count, recording_weekdays, sessions_per_day, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.title, b.project_type, template.id, b.riwayah, b.reader_id, sessionCount,
      b.recording_weekdays, b.sessions_per_day, b.description, req.user!.id],
  );
  await audit(req.user!.id, 'project_created', 'project', p.id, { title: b.title, type: b.project_type }, undefined, req);
  const admins = await many<{ id: number }>("SELECT id FROM users WHERE is_active AND 'admin' = ANY(roles)");
  await notify(admins.map((a) => a.id), { kind: 'project_awaiting_approval', params: { project: p.title }, link: `/projects/${p.id}`, projectId: p.id });
  res.status(201).json({ project: p });
}

export async function getProject(req: Request, res: Response) {
  const id = Number(req.params.id);
  const access = await assertProjectView(req.user!, id);
  const project = await one(`SELECT ${PROJECT_COLS} FROM projects p JOIN templates t ON t.id = p.template_id JOIN users r ON r.id = p.reader_id WHERE p.id = $1`, [id]);
  const team = await many(
    `SELECT m.id, m.team_role, m.user_id, u.full_name, m.assigned_at FROM project_members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1 AND m.removed_at IS NULL ORDER BY m.team_role, u.full_name`,
    [id],
  );
  const stats = await one(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE stage <> 'pending')::int AS recorded,
       count(*) FILTER (WHERE stage IN ('ready_for_mixing','mixed','done'))::int AS ready,
       count(*) FILTER (WHERE stage IN ('mixed','done'))::int AS mixed,
       count(*) FILTER (WHERE stage = 'done')::int AS done
     FROM sessions WHERE project_id = $1`,
    [id],
  );
  res.json({
    project,
    team,
    stats,
    me: { team_roles: access.teamRoles, is_reader: access.isReader, is_management: access.isManagement },
  });
}

/** Production manager sets agreed recording days (PRJ-06) and project details. */
export async function updateProject(req: Request, res: Response) {
  const id = Number(req.params.id);
  const b = req.body as Partial<{ title: string; riwayah: string; description: string | null; recording_weekdays: number[]; sessions_per_day: number }>;
  const p = await one(
    `UPDATE projects SET title = COALESCE($2, title), riwayah = COALESCE($3, riwayah),
       description = CASE WHEN $4::boolean THEN $5 ELSE description END,
       recording_weekdays = COALESCE($6, recording_weekdays), sessions_per_day = COALESCE($7, sessions_per_day), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, b.title ?? null, b.riwayah ?? null, b.description !== undefined, b.description ?? null, b.recording_weekdays ?? null, b.sessions_per_day ?? null],
  );
  if (!p) throw notFound('project_not_found');
  await audit(req.user!.id, 'project_updated', 'project', id, b as Record<string, unknown>, undefined, req);
  res.json({ project: p });
}

export async function approve(req: Request, res: Response) {
  const id = Number(req.params.id);
  await tx(async (db) => {
    await approveProject(db, id, req.user!.id);
    await audit(req.user!.id, 'project_approved', 'project', id, null, db, req);
  });
  res.json({ ok: true });
}

export async function start(req: Request, res: Response) {
  const id = Number(req.params.id);
  await tx(async (db) => {
    await startProject(db, id, req.user!.id);
    await audit(req.user!.id, 'project_started', 'project', id, null, db, req);
  });
  res.json({ ok: true });
}

export async function complete(req: Request, res: Response) {
  const id = Number(req.params.id);
  const p = await one("UPDATE projects SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1 AND status = 'distribution' RETURNING *", [id]);
  if (!p) throw conflict('project_not_in_distribution');
  await audit(req.user!.id, 'project_completed', 'project', id, null, undefined, req);
  res.json({ project: p });
}

export async function cancel(req: Request, res: Response) {
  const id = Number(req.params.id);
  const p = await one("UPDATE projects SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status NOT IN ('completed','cancelled') RETURNING *", [id]);
  if (!p) throw conflict('project_cannot_be_cancelled');
  await query('UPDATE stage_timers SET completed_at = now() WHERE project_id = $1 AND completed_at IS NULL', [id]);
  await audit(req.user!.id, 'project_cancelled', 'project', id, { reason: req.body?.reason ?? null }, undefined, req);
  res.json({ project: p });
}

// --------------------------------------------------------------------------
// Team (PRJ-04, PRJ-05, PRJ-07)
// --------------------------------------------------------------------------
const ROLE_REQUIREMENT: Record<TeamRole, string> = {
  mujiz: 'mujiz', technician: 'technician', reviewer1: 'reviewer', reviewer2: 'reviewer', final_reviewer: 'reviewer', mixing_lead: 'mixing_lead',
};

export async function teamHistory(req: Request, res: Response) {
  const id = Number(req.params.id);
  await assertProjectView(req.user!, id);
  const rows = await many(
    `SELECT m.*, u.full_name, a.full_name AS assigned_by_name, rb.full_name AS removed_by_name
     FROM project_members m JOIN users u ON u.id = m.user_id JOIN users a ON a.id = m.assigned_by LEFT JOIN users rb ON rb.id = m.removed_by
     WHERE m.project_id = $1 ORDER BY m.assigned_at DESC`,
    [id],
  );
  res.json({ history: rows });
}

/** Assigns a seat. If the seat is taken, the previous member is removed but kept in history. */
export async function assignMember(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const { team_role, user_id, reason } = req.body as { team_role: TeamRole; user_id: number; reason: string | null };
  const result = await tx(async (db) => {
    const p = await one('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [projectId], db);
    if (!p) throw notFound('project_not_found');
    if (['completed', 'cancelled'].includes(p.status)) throw conflict('project_closed');
    const u = await one('SELECT id, full_name FROM users WHERE id = $1 AND is_active AND $2::user_role = ANY(roles)', [user_id, ROLE_REQUIREMENT[team_role]], db);
    if (!u) throw badRequest('user_lacks_required_role');
    if (user_id === p.reader_id) throw badRequest('reader_cannot_be_team_member');
    let replaced: any = null;
    if (team_role !== 'final_reviewer') {
      replaced = await one(
        `UPDATE project_members SET removed_at = now(), removed_by = $3, change_reason = $4
         WHERE project_id = $1 AND team_role = $2 AND removed_at IS NULL RETURNING *`,
        [projectId, team_role, req.user!.id, reason],
        db,
      );
      if (replaced && replaced.user_id === user_id) throw conflict('already_assigned');
    }
    const m = await one(
      'INSERT INTO project_members (project_id, user_id, team_role, assigned_by, change_reason) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [projectId, user_id, team_role, req.user!.id, reason],
      db,
    );
    // Mid-project change: move open work of the replaced member to the new one
    if (replaced) {
      await query('UPDATE review_rounds SET reviewer_id = $2 WHERE reviewer_id = $1 AND status = \'open\' AND session_id IN (SELECT id FROM sessions WHERE project_id = $3)', [replaced.user_id, user_id, projectId], db);
      await query('UPDATE stage_timers SET assignee_id = $2 WHERE assignee_id = $1 AND completed_at IS NULL AND project_id = $3', [replaced.user_id, user_id, projectId], db);
    }
    await audit(req.user!.id, replaced ? 'team_member_replaced' : 'team_member_assigned', 'project', projectId, { team_role, user_id, replaced: replaced?.user_id ?? null, reason }, db, req);
    // PRJ-05: notify on assignment (only visible once the project is approved)
    await notify([user_id], { kind: 'team_assigned', params: { project: p.title, role: team_role }, link: `/projects/${projectId}`, projectId }, db);
    return m;
  });
  res.status(201).json({ member: result });
}

export async function removeMember(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  const m = await one('SELECT * FROM project_members WHERE id = $1 AND project_id = $2 AND removed_at IS NULL', [memberId, projectId]);
  if (!m) throw notFound('member_not_found');
  const p = await one('SELECT status FROM projects WHERE id = $1', [projectId]);
  if (['mujiz', 'technician', 'reviewer1', 'reviewer2'].includes(m.team_role) && !['pending_approval', 'approved'].includes(p.status)) {
    // keep BR-01 integrity: a running project must keep its core seats; use replace instead
    throw conflict('core_seat_must_be_replaced');
  }
  if (m.team_role === 'final_reviewer') {
    const open = await one(
      "SELECT 1 FROM review_rounds r JOIN sessions s ON s.id = r.session_id WHERE s.project_id = $1 AND r.reviewer_id = $2 AND r.status = 'open' LIMIT 1",
      [projectId, m.user_id],
    );
    if (open) throw conflict('final_reviewer_has_open_rounds');
  }
  await query('UPDATE project_members SET removed_at = now(), removed_by = $2, change_reason = $3 WHERE id = $1', [memberId, req.user!.id, req.body?.reason ?? null]);
  await audit(req.user!.id, 'team_member_removed', 'project', projectId, { member_id: memberId }, undefined, req);
  res.json({ ok: true });
}

// --------------------------------------------------------------------------
// Sessions grid (production manager home: projects x sessions x stages with alerts)
// --------------------------------------------------------------------------
export async function projectSessions(req: Request, res: Response) {
  const id = Number(req.params.id);
  await assertProjectView(req.user!, id);
  const rows = await many(
    `SELECT s.id, s.number, s.title, s.start_surah, s.start_ayah, s.end_surah, s.end_ayah, s.stage, s.stage_entered_at,
       s.recorded_at, s.ready_for_mixing_at, s.mixed_at, s.done_at,
       ss.name_ar AS start_surah_ar, ss.name_en AS start_surah_en, es.name_ar AS end_surah_ar, es.name_en AS end_surah_en,
       rr.round_type AS current_round_type, rr.reviewer_id AS current_reviewer_id, ru.full_name AS current_reviewer_name,
       (rr.first_opened_at IS NULL AND rr.status = 'open') AS unread,
       (SELECT COALESCE(max(alert_level),0) FROM stage_timers t WHERE t.session_id = s.id AND t.completed_at IS NULL) AS alert_level,
       (SELECT min(due_at) FROM stage_timers t WHERE t.session_id = s.id AND t.completed_at IS NULL) AS due_at,
       (SELECT count(*)::int FROM notes n WHERE n.session_id = s.id) AS notes_count,
       (SELECT count(*)::int FROM corrections c WHERE c.session_id = s.id AND c.status = 'open') AS open_corrections,
       (SELECT version_no FROM versions v WHERE v.session_id = s.id AND v.kind = 'raw' AND v.is_approved) AS raw_version,
       (SELECT version_no FROM versions v WHERE v.session_id = s.id AND v.kind = 'mixed' AND v.is_approved) AS mixed_version
     FROM sessions s
     LEFT JOIN surahs ss ON ss.number = s.start_surah LEFT JOIN surahs es ON es.number = s.end_surah
     LEFT JOIN review_rounds rr ON rr.id = s.current_round_id LEFT JOIN users ru ON ru.id = rr.reviewer_id
     WHERE s.project_id = $1 ORDER BY s.number`,
    [id],
  );
  res.json({ sessions: rows });
}

// --------------------------------------------------------------------------
// General notes on the reader (REV-05)
// --------------------------------------------------------------------------
export async function listGeneralNotes(req: Request, res: Response) {
  const id = Number(req.params.id);
  await assertProjectView(req.user!, id);
  const rows = await many(
    'SELECT g.*, u.full_name AS author_name FROM general_notes g JOIN users u ON u.id = g.author_id WHERE g.project_id = $1 ORDER BY g.created_at DESC',
    [id],
  );
  res.json({ notes: rows });
}

export async function addGeneralNote(req: Request, res: Response) {
  const id = Number(req.params.id);
  const access = await assertProjectView(req.user!, id);
  const canWrite = access.isManagement || access.teamRoles.some((r) => ['mujiz', 'reviewer1', 'reviewer2', 'final_reviewer', 'technician'].includes(r));
  if (!canWrite) throw forbidden();
  const { body, references_text } = req.body as { body: string; references_text: string | null };
  const n = await one('INSERT INTO general_notes (project_id, author_id, body, references_text) VALUES ($1,$2,$3,$4) RETURNING *', [id, req.user!.id, body, references_text]);
  await audit(req.user!.id, 'general_note_added', 'project', id, { note_id: n.id }, undefined, req);
  const team = await currentTeam(id);
  await notify([team.mujiz].filter((u) => u !== req.user!.id), { kind: 'general_note_added', params: { project: access.project.title }, link: `/projects/${id}`, projectId: id });
  res.status(201).json({ note: n });
}

// --------------------------------------------------------------------------
// Reader journey timeline (RDR-05, light phase 2)
// --------------------------------------------------------------------------
export async function journey(req: Request, res: Response) {
  const id = Number(req.params.id);
  await assertProjectView(req.user!, id);
  const p = await one('SELECT * FROM projects WHERE id = $1', [id]);
  const firstReview = await one(
    `SELECT min(r.assigned_at) AS start, max(r.submitted_at) FILTER (WHERE r.round_type <> 'final') AS end
     FROM review_rounds r JOIN sessions s ON s.id = r.session_id WHERE s.project_id = $1 AND r.round_type <> 'final'`,
    [id],
  );
  const firstBroadcast = await one('SELECT min(delivered_on) AS date, (array_agg(recipient ORDER BY delivered_on))[1] AS recipient FROM distributions WHERE project_id = $1', [id]);
  const lastRecorded = await one('SELECT max(recorded_at) AS at FROM sessions WHERE project_id = $1', [id]);
  const months = (a?: string | Date | null, b?: string | Date | null) => {
    if (!a) return null;
    const end = b ? new Date(b) : new Date();
    return Math.max(0, Math.round(((end.getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10);
  };
  res.json({
    steps: [
      { key: 'approved', at: p.approved_at },
      { key: 'recording', at: p.started_at, end: p.recording_completed_at, months: months(p.started_at, p.recording_completed_at ?? (p.started_at ? lastRecorded?.at ?? null : null)) },
      { key: 'reviews', at: firstReview?.start ?? null, end: firstReview?.end ?? null, months: months(firstReview?.start, firstReview?.end) },
      { key: 'mixing', at: p.mixing_started_at, end: p.final_review_started_at },
      { key: 'final_review', at: p.final_review_started_at },
      { key: 'first_broadcast', at: firstBroadcast?.date ?? null, detail: firstBroadcast?.recipient ?? null },
      { key: 'published', at: p.completed_at },
    ],
  });
}

// --------------------------------------------------------------------------
// Templates (lookup)
// --------------------------------------------------------------------------
export async function listTemplates(_req: Request, res: Response) {
  const rows = await many('SELECT id, code, project_type, name_ar, name_en, fixed_session_count, uses_hizb_ranges, review_rounds::text[] AS review_rounds FROM templates ORDER BY id');
  res.json({ templates: rows });
}
