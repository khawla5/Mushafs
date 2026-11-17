import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one } from '../config/db.js';
import { forbidden, unauthorized } from '../utils/http.js';

export type Role =
  | 'admin' | 'supervisor' | 'production_manager' | 'mujiz'
  | 'technician' | 'reader' | 'reviewer' | 'mixing_lead';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  roles: Role[];
  locale: 'ar' | 'en';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const AUTH_COOKIE = 'mushafs_token';

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

/** Parses roles returned by pg as '{a,b}' (enum arrays come back as strings). */
export function parseRoles(raw: unknown): Role[] {
  if (Array.isArray(raw)) return raw as Role[];
  if (typeof raw === 'string') return raw.replace(/^{|}$/g, '').split(',').filter(Boolean) as Role[];
  return [];
}

/** Requires a valid session cookie and an active user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) throw unauthorized();
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw unauthorized('session_expired');
    }
    const user = await one(
      'SELECT id, email, full_name, roles::text[] AS roles, locale, is_active FROM users WHERE id = $1',
      [Number(payload.sub)],
    );
    if (!user || !user.is_active) throw unauthorized();
    req.user = { id: user.id, email: user.email, full_name: user.full_name, roles: parseRoles(user.roles), locale: user.locale };
    next();
  } catch (err) {
    next(err);
  }
}

export const MANAGEMENT: Role[] = ['admin', 'supervisor', 'production_manager'];

export function hasRole(user: AuthUser | undefined, ...roles: Role[]) {
  return !!user && user.roles.some((r) => roles.includes(r));
}

export function isManagement(user: AuthUser | undefined) {
  return hasRole(user, ...MANAGEMENT);
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!hasRole(req.user, ...roles)) return next(forbidden());
    next();
  };
}
