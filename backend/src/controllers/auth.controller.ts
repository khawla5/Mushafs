import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../config/db.js';
import { clearAuthCookie, parseRoles, setAuthCookie, signToken } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../utils/http.js';
import { audit } from '../services/audit.service.js';

const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.wO3xrZ1V0YgJ8y8O7a1E8XG1y3eK';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await one('SELECT id, password_hash, is_active FROM users WHERE email = $1', [email]);
  // Always run bcrypt to keep timing similar for unknown emails
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.is_active) {
    await audit(user?.id ?? null, 'login_failed', 'user', user?.id ?? null, { email }, undefined, req);
    throw unauthorized('invalid_credentials');
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(user.id, 'login', 'user', user.id, null, undefined, req);
  setAuthCookie(res, signToken(user.id));
  res.json({ user: await meData(user.id) });
}

export async function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

async function meData(userId: number) {
  const u = await one('SELECT id, email, full_name, phone, roles::text[] AS roles, locale, last_login_at FROM users WHERE id = $1', [userId]);
  return { ...u, roles: parseRoles(u.roles) };
}

export async function me(req: Request, res: Response) {
  res.json({ user: await meData(req.user!.id) });
}

export async function updateMe(req: Request, res: Response) {
  const { locale, full_name, phone, current_password, new_password } = req.body as {
    locale?: 'ar' | 'en'; full_name?: string; phone?: string | null; current_password?: string; new_password?: string;
  };
  if (new_password) {
    const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!current_password || !(await bcrypt.compare(current_password, u.password_hash))) throw badRequest('current_password_incorrect');
    await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user!.id, await bcrypt.hash(new_password, 12)]);
    await audit(req.user!.id, 'password_changed', 'user', req.user!.id, null, undefined, req);
  }
  await query(
    `UPDATE users SET locale = COALESCE($2, locale), full_name = COALESCE($3, full_name),
       phone = CASE WHEN $4::boolean THEN $5 ELSE phone END, updated_at = now() WHERE id = $1`,
    [req.user!.id, locale ?? null, full_name ?? null, phone !== undefined, phone ?? null],
  );
  res.json({ user: await meData(req.user!.id) });
}
