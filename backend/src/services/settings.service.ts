import { z } from 'zod';
import { many, query, type Db, pool } from '../config/db.js';

/** Section 11.2 configurable settings with their validation rules. */
export const settingsSchema = z.object({
  editing_hours: z.number().positive().max(24 * 60),
  review_hours: z.number().positive().max(24 * 60),
  decision_hours: z.number().positive().max(24 * 60),
  corrections_hours: z.number().positive().max(24 * 60),
  quality_rating_hours: z.number().positive().max(24 * 60),
  mixing_hours: z.number().positive().max(24 * 365),
  orange_grace_hours: z.number().min(0).max(24 * 60),
  pm_grace_hours: z.number().min(0).max(24 * 60),
  excuse_cutoff: z.object({
    mode: z.enum(['hours', 'fixed']),
    hours: z.number().min(0).max(72),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
  auto_pass_no_notes: z.boolean(),
  technical_notes_to_technician: z.boolean(),
  day_counting: z.enum(['calendar', 'working']),
  weekend_days: z.array(z.number().int().min(0).max(6)).max(6),
  random_quality_after_session: z.number().int().min(1).max(600),
});

export type Settings = z.infer<typeof settingsSchema>;

export async function getSettings(db: Db = pool): Promise<Settings> {
  const rows = await many<{ key: string; value: unknown }>('SELECT key, value FROM settings', [], db);
  const obj: Record<string, unknown> = {};
  for (const r of rows) obj[r.key] = r.value;
  return settingsSchema.parse(obj);
}

export async function updateSettings(patch: Partial<Settings>, userId: number, db: Db = pool) {
  for (const [key, value] of Object.entries(patch)) {
    await query(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), userId],
      db,
    );
  }
  return getSettings(db);
}
