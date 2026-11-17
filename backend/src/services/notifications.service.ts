import type { Response } from 'express';
import { many, type Db, pool } from '../config/db.js';
import { logger } from '../utils/logger.js';

/**
 * PRJ-05, REV-01, DEC-03, TMR-02/03, ADM-04: notifications for assignments, handoffs and alerts.
 * Stored in PostgreSQL and pushed instantly to open browser tabs via Server-Sent Events.
 */

export interface NotificationInput {
  kind: string;
  params?: Record<string, unknown>;
  link?: string | null;
  projectId?: number | null;
}

const streams = new Map<number, Set<Response>>();

export function addStream(userId: number, res: Response) {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId)!.add(res);
}

export function removeStream(userId: number, res: Response) {
  const set = streams.get(userId);
  if (!set) return;
  set.delete(res);
  if (!set.size) streams.delete(userId);
}

function push(userId: number, payload: unknown) {
  const set = streams.get(userId);
  if (!set) return;
  const data = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch (err) {
      logger.warn({ err }, 'Failed to push SSE');
    }
  }
}

/**
 * Inserts notifications. When called inside a transaction, pass the client; pushes happen
 * right away (a rolled-back transaction would leave a stale toast, so callers notify last).
 */
export async function notify(userIds: Iterable<number | null | undefined>, input: NotificationInput, db: Db = pool) {
  const ids = [...new Set([...userIds].filter((x): x is number => typeof x === 'number'))];
  if (!ids.length) return;
  const rows = await many(
    `INSERT INTO notifications (user_id, kind, params, link, project_id)
     SELECT u, $2, $3, $4, $5 FROM unnest($1::bigint[]) AS u
     RETURNING id, user_id, kind, params, link, project_id, read_at, created_at`,
    [ids, input.kind, input.params ?? {}, input.link ?? null, input.projectId ?? null],
    db,
  );
  for (const r of rows) push(r.user_id, r);
}

/** Users holding any of the given global roles (active). */
export async function usersWithRoles(roles: string[], db: Db = pool): Promise<number[]> {
  const rows = await many<{ id: number }>(
    'SELECT id FROM users WHERE is_active AND roles && $1::user_role[]',
    [roles],
    db,
  );
  return rows.map((r) => r.id);
}

/** Heartbeat so proxies keep SSE connections open. */
setInterval(() => {
  for (const set of streams.values()) for (const res of set) res.write(': ping\n\n');
}, 25_000).unref();
