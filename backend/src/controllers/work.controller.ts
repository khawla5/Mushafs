import type { Request, Response } from 'express';
import { many } from '../config/db.js';
import { hasRole } from '../middleware/auth.js';

/**
 * Home screen data (section 10): current work for the signed-in user, by role.
 * "Daily actions take one tap, with no searching."
 */
export async function myWork(req: Request, res: Response) {
  const me = req.user!.id;
  const timerCols = `(SELECT max(alert_level) FROM stage_timers t WHERE t.session_id = s.id AND t.completed_at IS NULL) AS alert_level,
    (SELECT min(due_at) FROM stage_timers t WHERE t.session_id = s.id AND t.completed_at IS NULL) AS due_at`;

  const [recording, reviews, decisions, technician, quality, mixing, finalForward] = await Promise.all([
    // Reader / mujiz / technician: projects being recorded (check-in screen)
    many(
      `SELECT DISTINCT p.id, p.title, p.status,
         CASE WHEN p.reader_id = $1 THEN 'reader' ELSE m.team_role::text END AS seat
       FROM projects p LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $1 AND m.removed_at IS NULL AND m.team_role IN ('mujiz','technician')
       WHERE p.status = 'recording' AND (p.reader_id = $1 OR m.id IS NOT NULL) ORDER BY p.title`,
      [me],
    ),
    // Reviewers: open rounds, unread marked like messages
    many(
      `SELECT r.id AS round_id, r.round_type, r.assigned_at, (r.first_opened_at IS NULL) AS unread,
         s.id AS session_id, s.number, p.id AS project_id, p.title AS project_title, ${timerCols}
       FROM review_rounds r JOIN sessions s ON s.id = r.session_id JOIN projects p ON p.id = s.project_id
       WHERE r.reviewer_id = $1 AND r.status = 'open' ORDER BY unread DESC, r.assigned_at`,
      [me],
    ),
    // Main mujiz: sessions with notes awaiting a decision
    many(
      `SELECT s.id AS session_id, s.number, p.id AS project_id, p.title AS project_title,
         (SELECT count(*)::int FROM notes n WHERE n.round_id = s.current_round_id AND (n.current_decision IS NULL OR n.current_decision = 'studio')) AS pending_notes,
         ${timerCols}
       FROM sessions s JOIN projects p ON p.id = s.project_id
       JOIN project_members m ON m.project_id = p.id AND m.user_id = $1 AND m.team_role = 'mujiz' AND m.removed_at IS NULL
       WHERE s.stage = 'in_decision' ORDER BY p.title, s.number`,
      [me],
    ),
    // Technician: edit & upload, corrections, one-click passes
    many(
      `SELECT s.id AS session_id, s.number, s.stage, p.id AS project_id, p.title AS project_title,
         (SELECT count(*)::int FROM corrections c WHERE c.session_id = s.id AND c.status = 'open') AS open_corrections,
         ${timerCols}
       FROM sessions s JOIN projects p ON p.id = s.project_id
       JOIN project_members m ON m.project_id = p.id AND m.user_id = $1 AND m.team_role = 'technician' AND m.removed_at IS NULL
       WHERE s.stage IN ('editing','in_corrections','awaiting_pass') ORDER BY s.stage, p.title, s.number`,
      [me],
    ),
    // Mixing lead: quality rating requests
    hasRole(req.user, 'mixing_lead')
      ? many(
          `SELECT q.id, q.kind, q.requested_at, s.id AS session_id, s.number, p.id AS project_id, p.title AS project_title
           FROM quality_ratings q JOIN projects p ON p.id = q.project_id LEFT JOIN sessions s ON s.id = q.session_id
           WHERE q.verdict IS NULL AND (
             EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $1 AND m.team_role = 'mixing_lead' AND m.removed_at IS NULL)
             OR NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.team_role = 'mixing_lead' AND m.removed_at IS NULL))
           ORDER BY q.requested_at`,
          [me],
        )
      : Promise.resolve([]),
    // Mixing lead: mushafs ready for mixing (and final-review corrections to remix)
    hasRole(req.user, 'mixing_lead')
      ? many(
          `SELECT p.id AS project_id, p.title AS project_title, p.status,
             count(s.*) FILTER (WHERE s.stage = 'ready_for_mixing')::int AS to_mix,
             count(s.*) FILTER (WHERE s.stage = 'mixed')::int AS mixed,
             count(s.*) FILTER (WHERE s.stage = 'in_corrections')::int AS final_corrections
           FROM projects p JOIN sessions s ON s.project_id = p.id
           WHERE p.status IN ('mixing','final_review') AND (
             EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $1 AND m.team_role = 'mixing_lead' AND m.removed_at IS NULL)
             OR NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.team_role = 'mixing_lead' AND m.removed_at IS NULL))
           GROUP BY p.id ORDER BY p.title`,
          [me],
        )
      : Promise.resolve([]),
    // Production manager: final-review notes to forward to the mujiz
    hasRole(req.user, 'production_manager', 'admin')
      ? many(
          `SELECT s.id AS session_id, s.number, p.id AS project_id, p.title AS project_title,
             (SELECT count(*)::int FROM notes n WHERE n.round_id = s.current_round_id) AS notes
           FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.stage = 'pm_forward' ORDER BY p.title, s.number`,
        )
      : Promise.resolve([]),
  ]);

  let management: any = null;
  if (hasRole(req.user, 'admin', 'supervisor', 'production_manager')) {
    const [awaitingApproval, awaitingStart, awaitingFinalSplit, inDistribution, alerts] = await Promise.all([
      many("SELECT id, title, created_at FROM projects WHERE status = 'pending_approval' ORDER BY created_at"),
      many("SELECT id, title FROM projects WHERE status = 'approved' ORDER BY approved_at"),
      many(
        `SELECT p.id, p.title FROM projects p WHERE p.status = 'mixing'
         AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.project_id = p.id AND s.stage <> 'mixed')`,
      ),
      many("SELECT id, title FROM projects WHERE status = 'distribution' ORDER BY title"),
      many(
        `SELECT t.id, t.stage, t.alert_level, t.due_at, t.session_id, s.number, p.id AS project_id, p.title AS project_title, u.full_name AS assignee
         FROM stage_timers t JOIN projects p ON p.id = t.project_id LEFT JOIN sessions s ON s.id = t.session_id LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.completed_at IS NULL AND t.alert_level >= 1 ORDER BY t.alert_level DESC, t.due_at LIMIT 50`,
      ),
    ]);
    management = { awaitingApproval, awaitingStart, awaitingFinalSplit, inDistribution, alerts };
  }

  res.json({ recording, reviews, decisions, technician, quality, mixing, finalForward, management });
}
