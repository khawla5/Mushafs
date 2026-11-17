import type { Request, Response } from 'express';
import { many, one, query } from '../config/db.js';
import { audit } from '../services/audit.service.js';
import { addStream, removeStream } from '../services/notifications.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { notFound } from '../utils/http.js';

// ---------------------------------------------------------------- settings (ADM-02)
export async function readSettings(_req: Request, res: Response) {
  res.json({ settings: await getSettings() });
}

export async function writeSettings(req: Request, res: Response) {
  const settings = await updateSettings(req.body, req.user!.id);
  await audit(req.user!.id, 'settings_updated', 'settings', null, req.body, undefined, req);
  res.json({ settings });
}

// ---------------------------------------------------------------- note types
export async function listNoteTypes(req: Request, res: Response) {
  const all = req.query.all === 'true';
  const rows = await many(`SELECT * FROM note_types ${all ? '' : 'WHERE is_active'} ORDER BY sort_order, id`);
  res.json({ note_types: rows });
}

export async function createNoteType(req: Request, res: Response) {
  const b = req.body as { code: string; name_ar: string; name_en: string; severity: number; is_clear_error: boolean; is_technical: boolean; sort_order: number };
  const row = await one(
    'INSERT INTO note_types (code, name_ar, name_en, severity, is_clear_error, is_technical, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [b.code, b.name_ar, b.name_en, b.severity, b.is_clear_error, b.is_technical, b.sort_order],
  );
  await audit(req.user!.id, 'note_type_created', 'note_type', row.id, b, undefined, req);
  res.status(201).json({ note_type: row });
}

export async function updateNoteType(req: Request, res: Response) {
  const id = Number(req.params.id);
  const b = req.body as Record<string, unknown>;
  const keys = Object.keys(b);
  const row = keys.length
    ? await one(`UPDATE note_types SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => b[k])])
    : await one('SELECT * FROM note_types WHERE id = $1', [id]);
  if (!row) throw notFound('note_type_not_found');
  await audit(req.user!.id, 'note_type_updated', 'note_type', id, b, undefined, req);
  res.json({ note_type: row });
}

// ---------------------------------------------------------------- audit log (ADM-03)
export async function listAudit(req: Request, res: Response) {
  const { entity, user_id, limit = 100, offset = 0 } = req.query as unknown as { entity?: string; user_id?: number; limit: number; offset: number };
  const rows = await many(
    `SELECT a.*, u.full_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE ($1::text IS NULL OR a.entity = $1) AND ($2::bigint IS NULL OR a.user_id = $2)
     ORDER BY a.created_at DESC, a.id DESC LIMIT $3 OFFSET $4`,
    [entity ?? null, user_id ?? null, limit, offset],
  );
  const total = await one<{ n: number }>(
    'SELECT count(*)::int AS n FROM audit_log a WHERE ($1::text IS NULL OR a.entity = $1) AND ($2::bigint IS NULL OR a.user_id = $2)',
    [entity ?? null, user_id ?? null],
  );
  res.json({ entries: rows, total: total!.n });
}

// ---------------------------------------------------------------- notifications (ADM-04)
export async function listNotifications(req: Request, res: Response) {
  const rows = await many(
    'SELECT id, kind, params, link, project_id, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user!.id],
  );
  const unread = await one<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ notifications: rows, unread: unread!.n });
}

export async function markRead(req: Request, res: Response) {
  await query('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [Number(req.params.id), req.user!.id]);
  res.json({ ok: true });
}

export async function markAllRead(req: Request, res: Response) {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id]);
  res.json({ ok: true });
}

/** Server-Sent Events stream for instant notifications. */
export function notificationStream(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const userId = req.user!.id;
  addStream(userId, res);
  req.on('close', () => removeStream(userId, res));
}

// ---------------------------------------------------------------- Quran reference data
export async function surahs(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.json({ surahs: await many('SELECT number, name_ar, name_en, ayah_count FROM surahs ORDER BY number') });
}
