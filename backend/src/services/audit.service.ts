import type { Request } from 'express';
import { query, type Db, pool } from '../config/db.js';

/** ADM-03: audit log of every change and decision. */
export async function audit(
  userId: number | null,
  action: string,
  entity: string,
  entityId: string | number | null,
  details: Record<string, unknown> | null = null,
  db: Db = pool,
  req?: Request,
) {
  await query(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, action, entity, entityId === null ? null : String(entityId), details, req?.ip ?? null],
    db,
  );
}
