import { many, one, type Db, pool } from '../config/db.js';
import { type AuthUser, hasRole, isManagement } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/http.js';

/**
 * Permission principles (section 6):
 *  - People see only their own projects; a mujiz does not see future mushafs before approval.
 *  - Notes are visible to everyone involved and the general supervisor; only the main mujiz decides.
 *  - Detailed dashboard is for management only.
 *  - Personal data is visible only to its owner and the responsible admin function.
 */
export type TeamRole = 'mujiz' | 'technician' | 'reviewer1' | 'reviewer2' | 'final_reviewer' | 'mixing_lead';

export interface ProjectAccess {
  project: any;
  teamRoles: TeamRole[];
  isReader: boolean;
  isManagement: boolean;
}

export async function projectAccess(user: AuthUser, projectId: number, db: Db = pool): Promise<ProjectAccess> {
  const project = await one('SELECT * FROM projects WHERE id = $1', [projectId], db);
  if (!project) throw notFound('project_not_found');
  const members = await many<{ team_role: TeamRole }>(
    'SELECT team_role FROM project_members WHERE project_id = $1 AND user_id = $2 AND removed_at IS NULL',
    [projectId, user.id],
    db,
  );
  const teamRoles = members.map((m) => m.team_role);
  // Mixing leads without a specific assignment can work on any project once mixing/quality work exists.
  if (hasRole(user, 'mixing_lead') && !teamRoles.includes('mixing_lead') && project.status !== 'pending_approval') {
    const assigned = await one(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND team_role = 'mixing_lead' AND removed_at IS NULL",
      [projectId],
      db,
    );
    if (!assigned) teamRoles.push('mixing_lead');
  }
  return {
    project,
    teamRoles,
    isReader: project.reader_id === user.id,
    isManagement: isManagement(user),
  };
}

/** Throws unless the user may view the project. */
export async function assertProjectView(user: AuthUser, projectId: number, db: Db = pool) {
  const access = await projectAccess(user, projectId, db);
  const involved = access.teamRoles.length > 0 || access.isReader;
  if (access.isManagement) return access;
  if (!involved) throw forbidden('not_project_member');
  if (access.project.status === 'pending_approval') throw forbidden('project_not_approved');
  return access;
}

export function requireTeamRole(access: ProjectAccess, ...roles: TeamRole[]) {
  if (!access.teamRoles.some((r) => roles.includes(r))) throw forbidden('team_role_required');
}

export async function sessionWithProject(sessionId: number, db: Db = pool) {
  const s = await one('SELECT * FROM sessions WHERE id = $1', [sessionId], db);
  if (!s) throw notFound('session_not_found');
  return s;
}

/** Current team as { role: userId } for single seats, and final reviewers list. */
export async function currentTeam(projectId: number, db: Db = pool) {
  const rows = await many<{ team_role: TeamRole; user_id: number }>(
    'SELECT team_role, user_id FROM project_members WHERE project_id = $1 AND removed_at IS NULL',
    [projectId],
    db,
  );
  const team: Partial<Record<Exclude<TeamRole, 'final_reviewer'>, number>> & { final_reviewers: number[] } = { final_reviewers: [] };
  for (const r of rows) {
    if (r.team_role === 'final_reviewer') team.final_reviewers.push(r.user_id);
    else team[r.team_role] = r.user_id;
  }
  return team;
}

/** Mixing leads responsible for a project: assigned one, else everyone with the role. */
export async function mixingLeadsFor(projectId: number, db: Db = pool): Promise<number[]> {
  const team = await currentTeam(projectId, db);
  if (team.mixing_lead) return [team.mixing_lead];
  const rows = await many<{ id: number }>("SELECT id FROM users WHERE is_active AND 'mixing_lead' = ANY(roles)", [], db);
  return rows.map((r) => r.id);
}
