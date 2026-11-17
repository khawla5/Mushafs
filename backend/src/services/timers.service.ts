import { many, one, query, type Db, pool } from '../config/db.js';
import { addDuration } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { getSettings, type Settings } from './settings.service.js';
import { notify, usersWithRoles } from './notifications.service.js';

/**
 * TMR-01..05 / BR-07: timers apply to editing, reviews, decisions, corrections, quality rating
 * and mixing (recording itself is tracked by attendance and excuses).
 *
 * Escalation levels (TMR-02):
 *   0 = on time
 *   1 = orange  : allowed time passed                         -> worker notified
 *   2 = red     : + orange grace passed                       -> worker notified, escalated to production manager
 *   3 = PM red  : + production manager grace passed           -> general supervisor notified
 */
export type TimerStage = 'editing' | 'review' | 'quality_rating' | 'mixing' | 'decision' | 'corrections';

const STAGE_HOURS: Record<TimerStage, keyof Settings> = {
  editing: 'editing_hours',
  review: 'review_hours',
  decision: 'decision_hours',
  corrections: 'corrections_hours',
  quality_rating: 'quality_rating_hours',
  mixing: 'mixing_hours',
};

export interface StartTimerInput {
  projectId: number;
  sessionId?: number | null;
  roundId?: number | null;
  qualityRatingId?: number | null;
  stage: TimerStage;
  assigneeId: number | null;
}

export async function startTimer(input: StartTimerInput, db: Db = pool, settings?: Settings) {
  const s = settings ?? (await getSettings(db));
  const allowed = s[STAGE_HOURS[input.stage]] as number;
  const now = new Date();
  const due = addDuration(now, allowed, s.day_counting, s.weekend_days);
  const red = addDuration(due, s.orange_grace_hours, s.day_counting, s.weekend_days);
  const pmRed = addDuration(red, s.pm_grace_hours, s.day_counting, s.weekend_days);
  return one(
    `INSERT INTO stage_timers (project_id, session_id, round_id, quality_rating_id, stage, assignee_id,
        allowed_hours, orange_grace_hours, pm_grace_hours, day_counting, started_at, due_at, red_at, pm_red_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      input.projectId, input.sessionId ?? null, input.roundId ?? null, input.qualityRatingId ?? null,
      input.stage, input.assigneeId, allowed, s.orange_grace_hours, s.pm_grace_hours, s.day_counting,
      now, due, red, pmRed,
    ],
    db,
  );
}

/** Completes open timers matching the filter; records whether they finished on time (TMR-05). */
export async function completeTimers(
  filter: { sessionId?: number; roundId?: number; qualityRatingId?: number; projectId?: number; stage: TimerStage },
  db: Db = pool,
) {
  const conds = ['completed_at IS NULL', 'stage = $1'];
  const params: unknown[] = [filter.stage];
  if (filter.sessionId) { params.push(filter.sessionId); conds.push(`session_id = $${params.length}`); }
  if (filter.roundId) { params.push(filter.roundId); conds.push(`round_id = $${params.length}`); }
  if (filter.qualityRatingId) { params.push(filter.qualityRatingId); conds.push(`quality_rating_id = $${params.length}`); }
  if (filter.projectId) { params.push(filter.projectId); conds.push(`project_id = $${params.length}`); }
  await query(
    `UPDATE stage_timers SET completed_at = now(), completed_on_time = (now() <= due_at)
     WHERE ${conds.join(' AND ')}`,
    params,
    db,
  );
}

/** Scheduler tick: raise alert levels and send escalation notifications. */
export async function evaluateTimers(db: Db = pool) {
  const rows = await many(
    `WITH lvl AS (
       SELECT id,
         CASE WHEN now() >= pm_red_at THEN 3 WHEN now() >= red_at THEN 2 WHEN now() >= due_at THEN 1 ELSE 0 END AS new_level
       FROM stage_timers WHERE completed_at IS NULL
     )
     UPDATE stage_timers t SET alert_level = lvl.new_level
     FROM lvl WHERE t.id = lvl.id AND lvl.new_level > t.alert_level
     RETURNING t.*, (SELECT title FROM projects p WHERE p.id = t.project_id) AS project_title,
       (SELECT number FROM sessions s WHERE s.id = t.session_id) AS session_number`,
    [],
    db,
  );
  if (!rows.length) return 0;
  const managers = await usersWithRoles(['production_manager'], db);
  const supervisors = await usersWithRoles(['supervisor'], db);
  for (const t of rows) {
    const params = { stage: t.stage, project: t.project_title, session: t.session_number, level: t.alert_level };
    const link = t.session_id ? `/sessions/${t.session_id}` : `/projects/${t.project_id}`;
    const base = { params, link, projectId: t.project_id };
    if (t.alert_level >= 1) await notify([t.assignee_id], { ...base, kind: t.alert_level === 1 ? 'timer_orange' : 'timer_red' }, db);
    if (t.alert_level >= 2) await notify(managers, { ...base, kind: t.alert_level === 2 ? 'escalation_pm_orange' : 'escalation_pm_red' }, db);
    if (t.alert_level >= 3) await notify(supervisors, { ...base, kind: 'escalation_supervisor' }, db);
  }
  logger.info({ count: rows.length }, 'Timer escalations raised');
  return rows.length;
}

let handle: NodeJS.Timeout | null = null;

export function startScheduler(intervalSeconds: number) {
  const tick = () => evaluateTimers().catch((err) => logger.error({ err }, 'Timer evaluation failed'));
  tick();
  handle = setInterval(tick, intervalSeconds * 1000);
  handle.unref();
}

export function stopScheduler() {
  if (handle) clearInterval(handle);
}
