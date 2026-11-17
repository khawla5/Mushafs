import { env } from './config/env.js';
import { pool } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './services/timers.service.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    logger.fatal({ err }, `Cannot connect to PostgreSQL at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}. Is it running? (npm run db:up)`);
    process.exit(1);
  }
  const migrated = await pool.query("SELECT to_regclass('public.projects') AS t");
  if (!migrated.rows[0].t) {
    logger.fatal('Database schema missing. Run: npm run db:migrate');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.API_PORT, () => logger.info(`Mushafs API listening on http://localhost:${env.API_PORT}`));
  startScheduler(env.TIMER_INTERVAL_SECONDS);

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopScheduler();
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
