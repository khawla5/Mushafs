#!/usr/bin/env node
// Loads development seed data (database/seed.sql). Refuses to run in production.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withClient } from './db.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data when NODE_ENV=production');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(path.join(here, 'seed.sql'), 'utf8');

await withClient(async (client) => {
  await client.query(sql);
  const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
  console.log(`Seed applied. Users in database: ${rows[0].n}`);
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
