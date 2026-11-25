/**
 * Section 12.2 dashboard (rings) and 12.3 health indicator.
 * Ring 100% definitions (proposed in the BRD):
 *   Recording   sessions recorded = sessions expected from agreed recording days (excluding accepted excuses)
 *   Editing     all sessions edited within the allowed time
 *   Reviews     all reviews submitted within the allowed time
 *   Quality     no missed errors caught by a later round
 *   Distribution a counter of recipients and countries (no ceiling)
 */
import { many, one } from '../config/db.js';
import { centerDate, eachDate, weekdayOf } from '../utils/time.js';
import { MISSED_SQL } from './reports.service.js';

type Health = 'green' | 'blue' | 'red';

function band(pct: number | null): Health {
  if (pct === null) return 'green';
  if (pct >= 90) return 'green';
  if (pct >= 70) return 'blue';
  return 'red';
}

async function recordingRing(p: any) {
  const recorded = await one<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE project_id = $1 AND recorded_at IS NOT NULL", [p.id]);
  if (!p.started_at) return { recorded: recorded!.n, expected: 0, pct: null as number | null, status: 'not_started' };
  const from = centerDate(new Date(p.started_at));
  const to = centerDate(p.recording_completed_at ? new Date(p.recording_completed_at) : new Date());
  const excuses = await many<{ date_from: string; date_to: string }>(
    `SELECT date_from::text, date_to::text FROM excuses e WHERE e.project_id = $1 AND e.status = 'accepted'
       AND e.user_id IN (SELECT reader_id FROM projects WHERE id = $1 UNION SELECT user_id FROM project_members WHERE project_id = $1 AND team_role IN ('mujiz','technician'))`,
    [p.id],
  );
  let days = 0;
  for (const d of eachDate(from, to)) {
    if (!(p.recording_weekdays ?? []).includes(weekdayOf(d))) continue;
    if (excuses.some((e) => e.date_from <= d && d <= e.date_to)) continue;
    days++;
  }
  const expected = Math.min(p.session_count, days * (p.sessions_per_day || 1));
  const pct = expected === 0 ? null : Math.round((recorded!.n / expected) * 100);
  const status = pct === null ? 'on_plan' : pct > 100 ? 'ahead' : pct >= 90 ? 'on_plan' : 'behind';
  return { recorded: recorded!.n, expected, pct: pct === null ? null : Math.min(pct, 100), status };
}

async function timerRing(projectId: number, stage: string) {
  const r = await one<{ on_time: number; late: number; total: number }>(
    `SELECT count(*) FILTER (WHERE completed_on_time)::int AS on_time,
       count(*) FILTER (WHERE (completed_at IS NOT NULL AND NOT completed_on_time) OR (completed_at IS NULL AND now() > due_at))::int AS late,
       count(*)::int AS total
     FROM stage_timers WHERE project_id = $1 AND stage = $2`,
    [projectId, stage],
  );
  const measured = r!.on_time + r!.late;
  return { on_time: r!.on_time, late: r!.late, pct: measured ? Math.round((r!.on_time / measured) * 100) : null };
}

async function qualityRing(projectId: number) {
  const accepted = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM notes n JOIN sessions s ON s.id = n.session_id WHERE s.project_id = $1 AND n.current_decision IN ('accept','technician')",
    [projectId],
  );
  const missed = await one<{ n: number }>(`SELECT count(DISTINCT note_id)::int AS n FROM (${MISSED_SQL}) m WHERE m.project_id = $1`, [projectId]);
  const pct = accepted!.n ? Math.round(100 * (1 - missed!.n / accepted!.n)) : null;
  return { accepted: accepted!.n, missed: missed!.n, pct };
}

async function distribution(projectId: number) {
  const r = await one<{ recipients: number; countries: number; deliveries: number }>(
    'SELECT count(DISTINCT recipient)::int AS recipients, count(DISTINCT country)::int AS countries, count(*)::int AS deliveries FROM distributions WHERE project_id = $1',
    [projectId],
  );
  return r!;
}

async function progress(projectId: number) {
  return one(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE recorded_at IS NOT NULL)::int AS recorded,
       count(*) FILTER (WHERE stage IN ('ready_for_mixing','mixed','done'))::int AS reviewed,
       count(*) FILTER (WHERE stage IN ('mixed','done'))::int AS mixed,
       count(*) FILTER (WHERE stage = 'done')::int AS done
     FROM sessions WHERE project_id = $1`,
    [projectId],
  );
}

/** Project health = its worst dimension (time or quality), always with the reason shown. */
function health(rings: { recording: any; editing: any; reviews: any; quality: any }, alerts: { red: number }) {
  const candidates: { dim: string; pct: number | null; reason: string }[] = [
    { dim: 'time', pct: rings.recording.pct, reason: 'recording_behind' },
    { dim: 'time', pct: rings.editing.pct, reason: 'editing_late' },
    { dim: 'time', pct: rings.reviews.pct, reason: 'reviews_late' },
    { dim: 'quality', pct: rings.quality.pct, reason: 'missed_errors' },
  ];
  let worst = { color: 'green' as Health, reason: null as string | null, value: null as number | null };
  const rank: Record<Health, number> = { green: 0, blue: 1, red: 2 };
  for (const c of candidates) {
    const color = band(c.pct);
    if (rank[color] > rank[worst.color]) worst = { color, reason: c.reason, value: c.pct === null ? null : 100 - c.pct };
  }
  if (alerts.red > 0 && worst.color !== 'red') worst = { color: 'red', reason: 'red_alerts', value: alerts.red };
  return worst;
}

export async function dashboard(view: 'general' | 'detailed') {
  const projects = await many(
    `SELECT p.*, u.full_name AS reader_name FROM projects p JOIN users u ON u.id = p.reader_id
     WHERE p.status NOT IN ('pending_approval','cancelled') ORDER BY p.started_at DESC NULLS LAST, p.created_at DESC`,
  );
  const items = [];
  for (const p of projects) {
    const prog = await progress(p.id);
    const dist = await distribution(p.id);
    if (view === 'general') {
      // Never shows staff names or performance data
      items.push({ id: p.id, title: p.title, type: p.project_type, riwayah: p.riwayah, status: p.status, progress: prog, distribution: { recipients: dist.recipients, countries: dist.countries } });
      continue;
    }
    const rings = {
      recording: await recordingRing(p),
      editing: await timerRing(p.id, 'editing'),
      reviews: await timerRing(p.id, 'review'),
      quality: await qualityRing(p.id),
    };
    const alerts = await one<{ orange: number; red: number }>(
      `SELECT count(*) FILTER (WHERE alert_level = 1)::int AS orange, count(*) FILTER (WHERE alert_level >= 2)::int AS red
       FROM stage_timers WHERE project_id = $1 AND completed_at IS NULL`,
      [p.id],
    );
    const stalls = await many(
      `SELECT s.id, s.number, s.stage, s.stage_entered_at, t.alert_level, u.full_name AS assignee
       FROM sessions s JOIN stage_timers t ON t.session_id = s.id AND t.completed_at IS NULL LEFT JOIN users u ON u.id = t.assignee_id
       WHERE s.project_id = $1 AND t.alert_level > 0 ORDER BY t.alert_level DESC, s.stage_entered_at LIMIT 5`,
      [p.id],
    );
    items.push({
      id: p.id, title: p.title, type: p.project_type, riwayah: p.riwayah, status: p.status, reader_name: p.reader_name,
      progress: prog, rings, distribution: dist, alerts, stalls, health: health(rings, alerts!),
    });
  }
  if (view === 'general') {
    const reach = await one('SELECT count(DISTINCT recipient)::int AS recipients, count(DISTINCT country)::int AS countries FROM distributions');
    return { view, projects: items, reach };
  }
  const summary = { green: 0, blue: 0, red: 0 };
  for (const i of items as any[]) summary[i.health.color as Health]++;
  const reach = await many('SELECT country, count(DISTINCT recipient)::int AS recipients FROM distributions WHERE country IS NOT NULL GROUP BY country ORDER BY recipients DESC');
  return { view, projects: items, center_health: summary, reach };
}
