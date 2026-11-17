import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { many, one, query } from '../config/db.js';
import { hasRole, parseRoles } from '../middleware/auth.js';
import { audit } from '../services/audit.service.js';
import { badRequest, notFound } from '../utils/http.js';

const fields = 'id, email, full_name, phone, roles::text[] AS roles, locale, is_active, last_login_at, created_at';
const shape = (u: any) => (u ? { ...u, roles: parseRoles(u.roles) } : u);

/** ADM-01. Management lists users (e.g. to assign teams); non-admins get a reduced list. */
export async function listUsers(req: Request, res: Response) {
  const { role, active } = req.query as { role?: string; active?: string };
  const params: unknown[] = [];
  const conds: string[] = [];
  if (role) { params.push(role); conds.push(`$${params.length}::user_role = ANY(roles)`); }
  if (active !== undefined) { params.push(active === 'true'); conds.push(`is_active = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const admin = hasRole(req.user, 'admin');
  const cols = admin ? fields : 'id, full_name, roles::text[] AS roles, is_active';
  const rows = await many(`SELECT ${cols} FROM users ${where} ORDER BY full_name`, params);
  res.json({ users: rows.map(shape) });
}

export async function createUser(req: Request, res: Response) {
  const b = req.body as { email: string; full_name: string; phone?: string | null; roles: string[]; password: string; locale: string };
  const hash = await bcrypt.hash(b.password, 12);
  const u = await one(
    `INSERT INTO users (email, password_hash, full_name, phone, roles, locale) VALUES ($1,$2,$3,$4,$5::user_role[],$6) RETURNING ${fields}`,
    [b.email, hash, b.full_name, b.phone ?? null, b.roles, b.locale],
  );
  await audit(req.user!.id, 'user_created', 'user', u.id, { email: b.email, roles: b.roles }, undefined, req);
  res.status(201).json({ user: shape(u) });
}

export async function updateUser(req: Request, res: Response) {
  const id = Number(req.params.id);
  const b = req.body as { full_name?: string; phone?: string | null; roles?: string[]; is_active?: boolean; locale?: string };
  if (id === req.user!.id && (b.is_active === false || (b.roles && !b.roles.includes('admin')))) {
    throw badRequest('cannot_demote_self');
  }
  const u = await one(
    `UPDATE users SET full_name = COALESCE($2, full_name), phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       roles = COALESCE($5::user_role[], roles), is_active = COALESCE($6, is_active), locale = COALESCE($7, locale), updated_at = now()
     WHERE id = $1 RETURNING ${fields}`,
    [id, b.full_name ?? null, b.phone !== undefined, b.phone ?? null, b.roles ?? null, b.is_active ?? null, b.locale ?? null],
  );
  if (!u) throw notFound('user_not_found');
  await audit(req.user!.id, 'user_updated', 'user', id, b as Record<string, unknown>, undefined, req);
  res.json({ user: shape(u) });
}

export async function resetPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { password } = req.body as { password: string };
  const r = await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, await bcrypt.hash(password, 12)]);
  if (!r.rowCount) throw notFound('user_not_found');
  await audit(req.user!.id, 'password_reset', 'user', id, null, undefined, req);
  res.json({ ok: true });
}
