import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden } from '../utils/http.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (cookie is SameSite=Lax already):
 * state-changing requests must come from an allowed Origin when the browser sends one.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // non-browser clients (curl, tests)
  const host = req.get('host');
  const sameHost = host && (origin === `http://${host}` || origin === `https://${host}`);
  if (sameHost || env.clientOrigins.includes(origin)) return next();
  next(forbidden('bad_origin'));
}
