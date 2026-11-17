/**
 * Section 12: reports measure time, quantity and quality - all built from actions
 * recorded in the system (nobody enters report data by hand).
 */
import { many } from '../config/db.js';
import { centerDate, eachDate, weekdayOf } from '../utils/time.js';

export interface ReportFilter {
  projectId?: number | null;
  year?: number | null;
}

const projectCond = (alias: string, idx: number) => `($${idx}::bigint IS NULL OR ${alias}.project_id = $${idx})`;

/**
 * "Missed" errors (BR-11..13): an accepted note found in a later round of the same session
 * counts against every reviewer of an earlier round on that session, unless the ayah was
 * re-recorded after that earlier review (BR-12). Notes rejected by the mujiz are not errors (BR-13).
 */
const MISSED_SQL = `
  SELECT er.reviewer_id, n.id AS note_id, n.session_id, n.surah, n.ayah, t.is_clear_error, s.project_id
  FROM notes n
  JOIN note_types t ON t.id = n.note_type_id
  JOIN review_rounds lr ON lr.id = n.round_id
  JOIN sessions s ON s.id = n.session_id
  JOIN review_rounds er ON er.session_id = n.session_id AND er.round_no < lr.round_no AND er.status = 'submitted'
  WHERE n.current_decision IN ('accept','technician')
    AND NOT EXISTS (
      SELECT 1 FROM corrections c
      WHERE c.session_id = n.session_id AND c.is_rerecord AND c.surah = n.surah
        AND n.ayah BETWEEN c.ayah_from AND c.ayah_to AND c.done_at > er.submitted_at AND c.done_at < n.created_at
    )`;

export async function productionStatus(f: ReportFilter) {
  return many(
    `SELECT p.id, p.code, p.title, p.status, p.session_count,
       count(s.*) FILTER (WHERE s.stage = 'pending')::int AS pending,
       count(s.*) FILTER (WHERE s.stage = 'editing')::int AS editing,
       count(s.*) FILTER (WHERE s.stage = 'in_review')::int AS in_review,
       count(s.*) FILTER (WHERE s.stage IN ('in_decision','pm_forward'))::int AS in_decision,
       count(s.*) FILTER (WHERE s.stage IN ('in_corrections','awaiting_pass'))::int AS in_corrections,
       count(s.*) FILTER (WHERE s.stage = 'ready_for_mixing')::int AS ready_for_mixing,
       count(s.*) FILTER (WHERE s.stage = 'mixed')::int AS mixed,
       count(s.*) FILTER (WHERE s.stage = 'done')::int AS done,
       (SELECT s2.stage FROM sessions s2 WHERE s2.project_id = p.id AND s2.stage NOT IN ('pending','done','ready_for_mixing','mixed')
          GROUP BY s2.stage ORDER BY count(*) DESC LIMIT 1) AS bottleneck
     FROM projects p LEFT JOIN sessions s ON s.project_id = p.id
     WHERE ($1::bigint IS NULL OR p.id = $1) AND p.status NOT IN ('cancelled')
     GROUP BY p.id ORDER BY p.created_at DESC`,
    [f.projectId ?? null],
  );
}

/** Average time per stage, per person and year (from stage timers). */
export async function stageTimes(f: ReportFilter) {
  return many(
    `SELECT t.stage, EXTRACT(YEAR FROM t.started_at)::int AS year, u.full_name AS person, t.assignee_id,
       count(*)::int AS items,
       round(avg(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 3600)::numeric, 1) AS avg_hours,
       round(100.0 * avg(CASE WHEN t.completed_on_time THEN 1 ELSE 0 END), 0) AS on_time_pct
     FROM stage_timers t LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.completed_at IS NOT NULL AND ${projectCond('t', 1)} AND ($2::int IS NULL OR EXTRACT(YEAR FROM t.started_at) = $2)
     GROUP BY t.stage, year, u.full_name, t.assignee_id ORDER BY t.stage, year DESC, person`,
    [f.projectId ?? null, f.year ?? null],
  );
}

/** Agreed vs recorded days; excuses by person and reason. */
export async function recordingCommitment(f: ReportFilter) {
  const projects = await many(
    `SELECT id, title, recording_weekdays, started_at, recording_completed_at, reader_id FROM projects
     WHERE started_at IS NOT NULL AND ($1::bigint IS NULL OR id = $1)`,
    [f.projectId ?? null],
  );
  const out = [];
  for (const p of projects) {
    const from = centerDate(new Date(p.started_at));
    const to = centerDate(p.recording_completed_at ? new Date(p.recording_completed_at) : new Date());
    const sittingDays = new Set(
      (await many<{ d: string }>('SELECT DISTINCT sitting_date::text AS d FROM recording_sittings WHERE project_id = $1', [p.id])).map((r) => r.d),
    );
    const excuses = await many<{ date_from: string; date_to: string }>(
      "SELECT date_from::text, date_to::text FROM excuses WHERE project_id = $1 AND status = 'accepted'",
      [p.id],
    );
    let agreed = 0, recorded = 0, excused = 0, absent = 0;
    for (const d of eachDate(from, to)) {
      if (!(p.recording_weekdays ?? []).includes(weekdayOf(d))) continue;
      agreed++;
      if (sittingDays.has(d)) recorded++;
      else if (excuses.some((e) => e.date_from <= d && d <= e.date_to)) excused++;
      else absent++;
    }
    out.push({ project_id: p.id, project: p.title, agreed_days: agreed, recorded_days: recorded, excused_days: excused, unexplained_days: absent, extra_days: [...sittingDays].filter((d) => !(p.recording_weekdays ?? []).includes(weekdayOf(d))).length });
  }
  const excusesByPerson = await many(
    `SELECT u.full_name AS person, e.reason, count(*)::int AS count, count(*) FILTER (WHERE e.is_late)::int AS late,
       sum(e.date_to - e.date_from + 1)::int AS days
     FROM excuses e JOIN users u ON u.id = e.user_id WHERE ${projectCond('e', 1)}
     GROUP BY u.full_name, e.reason ORDER BY person, count DESC`,
    [f.projectId ?? null],
  );
  return { projects: out, excuses: excusesByPerson };
}

/** Clear errors (lahn jali): per mushaf, per mujiz (per recorded session) and the round that caught them. */
export async function clearErrors(f: ReportFilter) {
  const byProject = await many(
    `SELECT p.id, p.title, count(n.*)::int AS clear_errors,
       (SELECT count(*)::int FROM sessions s2 WHERE s2.project_id = p.id AND s2.recorded_at IS NOT NULL) AS recorded_sessions,
       count(n.*) FILTER (WHERE r.round_type = 'first')::int AS caught_first,
       count(n.*) FILTER (WHERE r.round_type = 'second')::int AS caught_second,
       count(n.*) FILTER (WHERE r.round_type = 'technical')::int AS caught_technical,
       count(n.*) FILTER (WHERE r.round_type = 'extra')::int AS caught_extra,
       count(n.*) FILTER (WHERE r.round_type = 'final')::int AS caught_final
     FROM projects p
     LEFT JOIN sessions s ON s.project_id = p.id
     LEFT JOIN notes n ON n.session_id = s.id AND n.current_decision IN ('accept','technician')
       AND n.note_type_id IN (SELECT id FROM note_types WHERE is_clear_error)
     LEFT JOIN review_rounds r ON r.id = n.round_id
     WHERE ($1::bigint IS NULL OR p.id = $1) AND p.started_at IS NOT NULL
     GROUP BY p.id ORDER BY p.title`,
    [f.projectId ?? null],
  );
  const byMujiz = await many(
    `SELECT u.full_name AS mujiz, count(DISTINCT n.id)::int AS clear_errors, count(DISTINCT s.id)::int AS recorded_sessions,
       round(count(DISTINCT n.id)::numeric / NULLIF(count(DISTINCT s.id), 0), 2) AS per_session
     FROM project_members m JOIN users u ON u.id = m.user_id
     JOIN sessions s ON s.project_id = m.project_id AND s.recorded_at IS NOT NULL
       AND s.recorded_at >= m.assigned_at AND (m.removed_at IS NULL OR s.recorded_at < m.removed_at)
     LEFT JOIN notes n ON n.session_id = s.id AND n.current_decision IN ('accept','technician')
       AND n.note_type_id IN (SELECT id FROM note_types WHERE is_clear_error)
     WHERE m.team_role = 'mujiz' AND ($1::bigint IS NULL OR m.project_id = $1)
     GROUP BY u.full_name ORDER BY u.full_name`,
    [f.projectId ?? null],
  );
  return { byProject, byMujiz };
}

/** Reader quality: notes per hizb, their types, re-recording rate. */
export async function readerQuality(f: ReportFilter) {
  return many(
    `SELECT p.id AS project_id, p.title, r.full_name AS reader,
       count(DISTINCT s.id) FILTER (WHERE s.recorded_at IS NOT NULL)::int AS recorded_sessions,
       count(n.*) FILTER (WHERE n.current_decision IN ('accept','technician'))::int AS accepted_notes,
       round(count(n.*) FILTER (WHERE n.current_decision IN ('accept','technician'))::numeric / NULLIF(count(DISTINCT s.id) FILTER (WHERE s.recorded_at IS NOT NULL), 0), 2) AS notes_per_session,
       (SELECT json_object_agg(code, c) FROM (
          SELECT t2.code, count(*)::int AS c FROM notes n2 JOIN sessions s2 ON s2.id = n2.session_id JOIN note_types t2 ON t2.id = n2.note_type_id
          WHERE s2.project_id = p.id AND n2.current_decision IN ('accept','technician') GROUP BY t2.code) x) AS by_type,
       (SELECT count(DISTINCT c.session_id)::int FROM corrections c JOIN sessions s3 ON s3.id = c.session_id WHERE s3.project_id = p.id AND c.is_rerecord) AS rerecorded_sessions
     FROM projects p JOIN users r ON r.id = p.reader_id
     LEFT JOIN sessions s ON s.project_id = p.id
     LEFT JOIN notes n ON n.session_id = s.id
     WHERE ($1::bigint IS NULL OR p.id = $1) AND p.started_at IS NOT NULL
     GROUP BY p.id, r.full_name ORDER BY p.title`,
    [f.projectId ?? null],
  );
}

/** Review quality: errors caught and missed per reviewer; share of their notes rejected (BR-11..13). */
export async function reviewQuality(f: ReportFilter) {
  return many(
    `WITH written AS (
       SELECT n.author_id AS reviewer_id, count(*)::int AS notes,
         count(*) FILTER (WHERE n.current_decision IN ('accept','technician'))::int AS caught,
         count(*) FILTER (WHERE n.current_decision = 'reject')::int AS rejected
       FROM notes n JOIN sessions s ON s.id = n.session_id
       JOIN review_rounds rr ON rr.id = n.round_id AND rr.status = 'submitted'
       WHERE ${projectCond('s', 1)}
       GROUP BY n.author_id
     ), missed AS (
       SELECT reviewer_id, count(DISTINCT note_id)::int AS missed, count(DISTINCT note_id) FILTER (WHERE is_clear_error)::int AS missed_clear
       FROM (${MISSED_SQL}) m WHERE ($1::bigint IS NULL OR m.project_id = $1) GROUP BY reviewer_id
     ), rounds AS (
       SELECT r.reviewer_id, count(*)::int AS rounds, count(*) FILTER (WHERE r.result = 'no_notes')::int AS no_notes_rounds
       FROM review_rounds r JOIN sessions s ON s.id = r.session_id WHERE r.status = 'submitted' AND ${projectCond('s', 1)}
       GROUP BY r.reviewer_id
     )
     SELECT u.id, u.full_name AS reviewer, COALESCE(ro.rounds,0) AS rounds, COALESCE(ro.no_notes_rounds,0) AS no_notes_rounds,
       COALESCE(w.notes,0) AS notes, COALESCE(w.caught,0) AS caught, COALESCE(w.rejected,0) AS rejected,
       round(100.0 * COALESCE(w.rejected,0) / NULLIF(w.notes,0), 0) AS rejected_pct,
       COALESCE(m.missed,0) AS missed, COALESCE(m.missed_clear,0) AS missed_clear
     FROM users u LEFT JOIN written w ON w.reviewer_id = u.id LEFT JOIN missed m ON m.reviewer_id = u.id LEFT JOIN rounds ro ON ro.reviewer_id = u.id
     WHERE ro.rounds IS NOT NULL OR w.notes IS NOT NULL
     ORDER BY u.full_name`,
    [f.projectId ?? null],
  );
}

/** Recording and editing quality: mixing lead ratings; technical notes from reviewers. */
export async function recordingQuality(f: ReportFilter) {
  const ratings = await many(
    `SELECT p.title, q.kind, s.number AS session, q.verdict, q.notes, q.rated_at, u.full_name AS rated_by
     FROM quality_ratings q JOIN projects p ON p.id = q.project_id LEFT JOIN sessions s ON s.id = q.session_id LEFT JOIN users u ON u.id = q.rated_by
     WHERE ${projectCond('q', 1)} ORDER BY q.requested_at DESC`,
    [f.projectId ?? null],
  );
  const technical = await many(
    `SELECT p.title, count(n.*)::int AS technical_notes,
       count(n.*) FILTER (WHERE n.current_decision IN ('accept','technician'))::int AS confirmed
     FROM projects p JOIN sessions s ON s.project_id = p.id JOIN notes n ON n.session_id = s.id JOIN note_types t ON t.id = n.note_type_id AND t.is_technical
     WHERE ($1::bigint IS NULL OR p.id = $1) GROUP BY p.title ORDER BY p.title`,
    [f.projectId ?? null],
  );
  return { ratings, technical };
}

/** Speed vs quality: do notes increase when a mushaf is recorded faster? */
export async function speedVsQuality(f: ReportFilter) {
  return many(
    `SELECT p.id, p.title,
       round(EXTRACT(EPOCH FROM (COALESCE(p.recording_completed_at, now()) - p.started_at)) / 86400 / 7, 1) AS recording_weeks,
       count(DISTINCT s.id) FILTER (WHERE s.recorded_at IS NOT NULL)::int AS recorded_sessions,
       count(n.*) FILTER (WHERE n.current_decision IN ('accept','technician'))::int AS accepted_notes,
       round(count(n.*) FILTER (WHERE n.current_decision IN ('accept','technician'))::numeric / NULLIF(count(DISTINCT s.id) FILTER (WHERE s.recorded_at IS NOT NULL), 0), 2) AS notes_per_session
     FROM projects p LEFT JOIN sessions s ON s.project_id = p.id LEFT JOIN notes n ON n.session_id = s.id
     WHERE p.started_at IS NOT NULL AND ($1::bigint IS NULL OR p.id = $1)
     GROUP BY p.id ORDER BY recording_weeks`,
    [f.projectId ?? null],
  );
}

/** Workload: sessions pending with each reviewer, technician and mujiz. */
export async function workload(f: ReportFilter) {
  return many(
    `SELECT u.id, u.full_name AS person, t.stage, count(*)::int AS items, max(t.alert_level)::int AS worst_alert
     FROM stage_timers t JOIN users u ON u.id = t.assignee_id
     WHERE t.completed_at IS NULL AND ${projectCond('t', 1)}
     GROUP BY u.id, u.full_name, t.stage ORDER BY items DESC, person`,
    [f.projectId ?? null],
  );
}

/** Annual output: mushafs and hadith completed, by type. */
export async function annualOutput(f: ReportFilter) {
  return many(
    `SELECT EXTRACT(YEAR FROM COALESCE(completed_at, final_review_started_at))::int AS year, project_type,
       count(*) FILTER (WHERE status = 'completed')::int AS completed,
       count(*) FILTER (WHERE status = 'distribution')::int AS in_distribution
     FROM projects WHERE status IN ('completed','distribution') AND ($1::int IS NULL OR EXTRACT(YEAR FROM COALESCE(completed_at, final_review_started_at)) = $1)
     GROUP BY year, project_type ORDER BY year DESC, project_type`,
    [f.year ?? null],
  );
}

/** Distribution and reach (light phase 2). */
export async function distributionReach(f: ReportFilter) {
  return many(
    `SELECT p.title, count(d.*)::int AS deliveries, count(DISTINCT d.recipient)::int AS recipients,
       count(DISTINCT d.country)::int AS countries, array_remove(array_agg(DISTINCT d.channel), NULL) AS channels
     FROM projects p JOIN distributions d ON d.project_id = p.id
     WHERE ($1::bigint IS NULL OR p.id = $1) GROUP BY p.title ORDER BY deliveries DESC`,
    [f.projectId ?? null],
  );
}

export const REPORTS = {
  'production-status': productionStatus,
  'stage-times': stageTimes,
  'recording-commitment': recordingCommitment,
  'clear-errors': clearErrors,
  'reader-quality': readerQuality,
  'review-quality': reviewQuality,
  'recording-quality': recordingQuality,
  'speed-vs-quality': speedVsQuality,
  workload,
  'annual-output': annualOutput,
  'distribution-reach': distributionReach,
} as const;

export type ReportName = keyof typeof REPORTS;

export { MISSED_SQL };
