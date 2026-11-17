import type { Request, Response } from 'express';
import { many, one, query, tx, type Db, pool } from '../config/db.js';
import { isManagement } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
import { assertProjectView, currentTeam } from '../services/access.service.js';
import { notify, usersWithRoles } from '../services/notifications.service.js';
import { getSettings } from '../services/settings.service.js';
import { markSessionsRecorded } from '../services/workflow.service.js';
import { addDays, centerDate, centerDateTime, startOfCenterDay, weekdayOf } from '../utils/time.js';
import { badRequest, conflict, forbidden } from '../utils/http.js';

type SeatRole = 'reader' | 'mujiz' | 'technician';
const ORDER: SeatRole[] = ['reader', 'mujiz', 'technician'];

async function mySeats(userId: number, projectId: number, db: Db = pool): Promise<SeatRole[]> {
  const p = await one('SELECT reader_id FROM projects WHERE id = $1', [projectId], db);
  const team = await currentTeam(projectId, db);
  const seats: SeatRole[] = [];
  if (p?.reader_id === userId) seats.push('reader');
  if (team.mujiz === userId) seats.push('mujiz');
  if (team.technician === userId) seats.push('technician');
  return seats;
}

const SESSION_COLS = `s.id, s.number, s.title, s.stage, s.start_surah, s.start_ayah, s.end_surah, s.end_ayah, s.recorded_at,
  ss.name_ar AS start_surah_ar, ss.name_en AS start_surah_en, es.name_ar AS end_surah_ar, es.name_en AS end_surah_en`;
const SESSION_JOIN = 'LEFT JOIN surahs ss ON ss.number = s.start_surah LEFT JOIN surahs es ON es.number = s.end_surah';

/** BR-04: excuse cutoff for a given first date (see docs for the interpretation). */
async function cutoffFor(projectId: number, dateFrom: string, db: Db = pool) {
  const s = await getSettings(db);
  if (s.excuse_cutoff.mode === 'fixed') return centerDateTime(addDays(dateFrom, -1), s.excuse_cutoff.time);
  const last = await one<{ at: Date }>(
    `SELECT max(c.checked_in_at) AS at FROM checkins c JOIN recording_sittings rs ON rs.id = c.sitting_id
     WHERE rs.project_id = $1 AND c.role = 'technician' AND c.checked_in_at < $2`,
    [projectId, startOfCenterDay(dateFrom)],
    db,
  );
  const dayStart = startOfCenterDay(dateFrom);
  if (!last?.at) return dayStart;
  // Only applies when no agreed recording day lies between that check-in and the excused date
  const p = await one('SELECT recording_weekdays FROM projects WHERE id = $1', [projectId], db);
  const days: number[] = p?.recording_weekdays ?? [];
  for (let d = addDays(centerDate(new Date(last.at)), 1); d < dateFrom; d = addDays(d, 1)) {
    if (days.includes(weekdayOf(d))) return dayStart;
  }
  return new Date(new Date(last.at).getTime() + s.excuse_cutoff.hours * 3_600_000);
}

/** ATT-01: "Today" screen for a project. */
export async function today(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const access = await assertProjectView(req.user!, projectId);
  const p = access.project;
  const next = await many(`SELECT ${SESSION_COLS} FROM sessions s ${SESSION_JOIN} WHERE s.project_id = $1 AND s.stage = 'pending' ORDER BY s.number LIMIT 6`, [projectId]);
  const previous = await one(`SELECT ${SESSION_COLS} FROM sessions s ${SESSION_JOIN} WHERE s.project_id = $1 AND s.stage <> 'pending' ORDER BY s.number DESC LIMIT 1`, [projectId]);
  const sitting = await one('SELECT * FROM recording_sittings WHERE project_id = $1 AND closed_at IS NULL', [projectId]);
  const checkins = sitting
    ? await many('SELECT c.role, c.checked_in_at, u.full_name FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.sitting_id = $1', [sitting.id])
    : [];
  const done = new Set(checkins.map((c: any) => c.role));
  const seats = await mySeats(req.user!.id, projectId);
  const todayDate = centerDate();
  const nextDayCutoff = await cutoffFor(projectId, addDays(todayDate, 1));
  const lastTech = await one(
    `SELECT max(c.checked_in_at) AS at FROM checkins c JOIN recording_sittings rs ON rs.id = c.sitting_id WHERE rs.project_id = $1 AND c.role = 'technician'`,
    [projectId],
  );
  res.json({
    project: { id: p.id, title: p.title, status: p.status, recording_weekdays: p.recording_weekdays, sessions_per_day: p.sessions_per_day },
    today: todayDate,
    is_recording_day: (p.recording_weekdays ?? []).includes(weekdayOf(todayDate)),
    previous,
    next: next[0] ?? null,
    upcoming: next.slice(1),
    sitting: sitting ? { id: sitting.id, date: sitting.sitting_date, opened_at: sitting.opened_at, checkins } : null,
    my_seats: seats,
    can_check_in: Object.fromEntries(
      ORDER.map((role, i) => [role, p.status === 'recording' && seats.includes(role) && !done.has(role) && ORDER.slice(0, i).every((r) => done.has(r))]),
    ),
    excuse_window: { opens_at: lastTech?.at ?? null, cutoff_next_day: nextDayCutoff },
  });
}

/** ATT-02/03/06: ordered check-in; technician check-in records the session(s). */
export async function checkIn(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const { role, outcome, outcome_note } = req.body as { role: SeatRole; outcome?: 'full' | 'two_sessions' | 'corrections_only' | 'incomplete'; outcome_note: string | null };
  const result = await tx(async (db) => {
    const p = await one('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [projectId], db);
    if (!p) throw badRequest('project_not_found');
    if (p.status !== 'recording') throw conflict('project_not_recording');
    const seats = await mySeats(req.user!.id, projectId, db);
    if (!seats.includes(role)) throw forbidden('not_your_seat');
    let sitting = await one('SELECT * FROM recording_sittings WHERE project_id = $1 AND closed_at IS NULL', [projectId], db);
    if (role === 'reader') {
      if (sitting) throw conflict('sitting_already_open');
      sitting = await one('INSERT INTO recording_sittings (project_id, sitting_date) VALUES ($1, $2) RETURNING *', [projectId, centerDate()], db);
    }
    if (!sitting) throw conflict('reader_must_check_in_first');
    const done = (await many('SELECT role FROM checkins WHERE sitting_id = $1', [sitting.id], db)).map((r: any) => r.role);
    if (done.includes(role)) throw conflict('already_checked_in');
    const idx = ORDER.indexOf(role);
    const missing = ORDER.slice(0, idx).filter((r) => !done.includes(r));
    if (missing.length) throw conflict(`${missing[0]}_must_check_in_first`);
    await query('INSERT INTO checkins (sitting_id, user_id, role) VALUES ($1,$2,$3)', [sitting.id, req.user!.id, role], db);

    let recorded: number[] = [];
    if (role === 'technician') {
      if (!outcome) throw badRequest('outcome_required');
      const count = outcome === 'full' ? 1 : outcome === 'two_sessions' ? 2 : 0;
      if (count) {
        const pending = await many<{ id: number }>("SELECT id FROM sessions WHERE project_id = $1 AND stage = 'pending' ORDER BY number LIMIT $2", [projectId, count], db);
        if (pending.length < count) throw conflict('not_enough_pending_sessions');
        recorded = pending.map((s) => s.id);
        for (const id of recorded) await query('INSERT INTO sitting_sessions (sitting_id, session_id) VALUES ($1,$2)', [sitting.id, id], db);
        await markSessionsRecorded(db, projectId, recorded, req.user!.id);
      }
      await query('UPDATE recording_sittings SET outcome = $2, outcome_note = $3, closed_at = now() WHERE id = $1', [sitting.id, outcome, outcome_note], db);
    }
    await audit(req.user!.id, 'check_in', 'project', projectId, { role, outcome: outcome ?? null, sitting_id: sitting.id, sessions: recorded }, db, req);
    // Let the next person in order know
    const team = await currentTeam(projectId, db);
    const nextSeat = role === 'reader' ? team.mujiz : role === 'mujiz' ? team.technician : null;
    if (nextSeat) await notify([nextSeat], { kind: 'checkin_your_turn', params: { project: p.title }, link: `/projects/${projectId}`, projectId }, db);
    return { sitting_id: sitting.id, recorded_sessions: recorded };
  });
  res.status(201).json(result);
}

/** ATT-07: attendance & excuse log per project and per person. */
export async function attendanceLog(req: Request, res: Response) {
  const { project_id, user_id } = req.query as { project_id?: string; user_id?: string };
  const pid = project_id ? Number(project_id) : null;
  const uid = user_id ? Number(user_id) : null;
  if (pid) await assertProjectView(req.user!, pid);
  if (!isManagement(req.user) && uid !== req.user!.id && !pid) throw forbidden();
  const sittings = await many(
    `SELECT rs.id, rs.project_id, p.title AS project_title, rs.sitting_date, rs.outcome, rs.outcome_note, rs.opened_at, rs.closed_at,
       COALESCE(json_agg(json_build_object('role', c.role, 'user_id', c.user_id, 'full_name', u.full_name, 'checked_in_at', c.checked_in_at) ORDER BY c.checked_in_at)
         FILTER (WHERE c.id IS NOT NULL), '[]') AS checkins,
       (SELECT array_agg(s.number ORDER BY s.number) FROM sitting_sessions x JOIN sessions s ON s.id = x.session_id WHERE x.sitting_id = rs.id) AS session_numbers
     FROM recording_sittings rs JOIN projects p ON p.id = rs.project_id
     LEFT JOIN checkins c ON c.sitting_id = rs.id LEFT JOIN users u ON u.id = c.user_id
     WHERE ($1::bigint IS NULL OR rs.project_id = $1)
       AND ($2::bigint IS NULL OR EXISTS (SELECT 1 FROM checkins c2 WHERE c2.sitting_id = rs.id AND c2.user_id = $2))
     GROUP BY rs.id, p.title ORDER BY rs.sitting_date DESC, rs.id DESC LIMIT 500`,
    [pid, uid],
  );
  const excuses = await many(
    `SELECT e.*, u.full_name, p.title AS project_title FROM excuses e JOIN users u ON u.id = e.user_id JOIN projects p ON p.id = e.project_id
     WHERE ($1::bigint IS NULL OR e.project_id = $1) AND ($2::bigint IS NULL OR e.user_id = $2)
     ORDER BY e.date_from DESC LIMIT 500`,
    [pid, uid],
  );
  res.json({ sittings, excuses });
}

/** ATT-04/05, BR-04/05: excuse for one day or a date range; late excuses accepted and flagged. */
export async function createExcuse(req: Request, res: Response) {
  const projectId = Number(req.params.id);
  const { date_from, date_to, reason } = req.body as { date_from: string; date_to: string; reason: string };
  if (date_to < date_from) throw badRequest('invalid_date_range');
  const access = await assertProjectView(req.user!, projectId);
  if (!['recording', 'approved'].includes(access.project.status)) throw conflict('project_not_recording');
  const seats = await mySeats(req.user!.id, projectId);
  if (!seats.length) throw forbidden('not_your_seat');
  if (date_to < centerDate()) throw badRequest('excuse_in_past');
  const cutoff = await cutoffFor(projectId, date_from);
  const isLate = Date.now() > cutoff.getTime();
  const e = await one(
    'INSERT INTO excuses (project_id, user_id, date_from, date_to, reason, is_late) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [projectId, req.user!.id, date_from, date_to, reason, isLate],
  );
  await audit(req.user!.id, 'excuse_submitted', 'project', projectId, { excuse_id: e.id, is_late: isLate }, undefined, req);
  const team = await currentTeam(projectId);
  const managers = await usersWithRoles(['production_manager']);
  const others = [access.project.reader_id, team.mujiz, team.technician].filter((u) => u !== req.user!.id);
  await notify([...others, ...managers], {
    kind: isLate ? 'excuse_late' : 'excuse_submitted',
    params: { project: access.project.title, name: req.user!.full_name, from: date_from, to: date_to },
    link: `/projects/${projectId}`, projectId,
  });
  res.status(201).json({ excuse: e, cutoff });
}

export async function setExcuseStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { status } = req.body as { status: 'accepted' | 'rejected' };
  const e = await one('UPDATE excuses SET status = $2, status_by = $3, status_at = now() WHERE id = $1 RETURNING *', [id, status, req.user!.id]);
  if (!e) throw badRequest('excuse_not_found');
  await audit(req.user!.id, 'excuse_status_changed', 'excuse', id, { status }, undefined, req);
  await notify([e.user_id], { kind: 'excuse_status', params: { status }, link: `/projects/${e.project_id}`, projectId: e.project_id });
  res.json({ excuse: e });
}
