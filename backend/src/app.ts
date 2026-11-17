import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env, projectRoot } from './config/env.js';
import { pool } from './config/db.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { originCheck } from './middleware/security.js';
import { logger } from './utils/logger.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import projectRoutes, { productionRoutes } from './routes/projects.routes.js';
import sessionRoutes from './routes/sessions.routes.js';
import { ffmpegAvailable } from './services/audio.service.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'media-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.includes('/notifications/stream') ?? false }, quietReqLogger: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', originCheck);
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', ffmpeg: ffmpegAvailable() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api/auth', authRoutes);
  const api = express.Router();
  api.use(adminRoutes, projectRoutes, productionRoutes, sessionRoutes);
  app.use('/api', requireAuth, api);
  app.use('/api', notFoundHandler);

  // In production the backend also serves the built frontend
  const dist = path.join(projectRoot, 'frontend', 'dist');
  if (env.isProd && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '7d' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
