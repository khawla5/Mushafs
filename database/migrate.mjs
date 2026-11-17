#!/usr/bin/env node
// Applies SQL migrations in database/migrations in filename order.
// Each migration runs inside a transaction and is recorded in schema_migrations.
//   node migrate.mjs           apply pending migrations
//   node migrate.mjs --reset   DROP the public schema first (development only!)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withClient, migrationsDir } from './db.mjs';

const reset = process.argv.includes('--reset');

await withClient(async (client) => {
  if (reset) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to reset the database when NODE_ENV=production');
    }
    console.log('Resetting schema "public"...');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    process.stdout.write(`Applying ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('done');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw err;
    }
  }
  console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
