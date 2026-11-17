import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { notFound } from '../utils/http.js';

const require = createRequire(import.meta.url);
let ffmpegPath: string | null = null;
try {
  ffmpegPath = require('ffmpeg-static') as string;
  if (ffmpegPath && !fs.existsSync(ffmpegPath)) ffmpegPath = null;
} catch {
  ffmpegPath = null;
}

export const audioRoot = path.join(env.storageDir, 'audio');
export const privateRoot = path.join(env.storageDir, 'private');
fs.mkdirSync(audioRoot, { recursive: true });
fs.mkdirSync(privateRoot, { recursive: true });

export function ffmpegAvailable() {
  return !!ffmpegPath;
}

/** Moves an uploaded temp file to its permanent location; returns the path relative to storage. */
export async function storeAudio(tmpPath: string, projectId: number, sessionNumber: number, kind: string, versionNo: number, ext: string) {
  const dir = path.join(audioRoot, `project-${projectId}`, `session-${String(sessionNumber).padStart(2, '0')}`);
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${kind}-v${versionNo}${ext.toLowerCase()}`);
  await fsp.rename(tmpPath, file).catch(async () => {
    await fsp.copyFile(tmpPath, file);
    await fsp.unlink(tmpPath);
  });
  return path.relative(env.storageDir, file);
}

export function absolute(relPath: string) {
  const abs = path.resolve(env.storageDir, relPath);
  if (!abs.startsWith(path.resolve(env.storageDir))) throw notFound();
  return abs;
}

/**
 * FIL-02: creates the light listening copy (MP3) for reviewers and reads the duration.
 * Runs in the background after upload; the version row tracks status.
 */
export function createLightCopy(versionId: number, relPath: string) {
  const src = absolute(relPath);
  const lightRel = relPath.replace(/\.[^.]+$/, '') + '.light.mp3';
  const dst = absolute(lightRel);
  if (!ffmpegPath) {
    logger.warn('ffmpeg not available; light copy skipped, original will be streamed');
    void query("UPDATE versions SET light_status = 'failed' WHERE id = $1", [versionId]);
    return;
  }
  const args = ['-hide_banner', '-y', '-i', src, '-vn', '-codec:a', 'libmp3lame', '-b:a', env.LIGHT_COPY_BITRATE, dst];
  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 200_000) stderr = stderr.slice(-50_000);
  });
  proc.on('close', async (code) => {
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
    try {
      if (code === 0) {
        await query("UPDATE versions SET light_status = 'ready', light_path = $2, duration_sec = $3 WHERE id = $1", [versionId, lightRel, duration]);
      } else {
        logger.error({ versionId, code, tail: stderr.slice(-500) }, 'Light copy failed');
        await query("UPDATE versions SET light_status = 'failed', duration_sec = $2 WHERE id = $1", [versionId, duration]);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to update version after transcoding');
    }
  });
  proc.on('error', async (err) => {
    logger.error({ err }, 'ffmpeg spawn failed');
    await query("UPDATE versions SET light_status = 'failed' WHERE id = $1", [versionId]).catch(() => undefined);
  });
}

/** Streams a file with HTTP Range support (smooth scrubbing in the player). */
export async function streamFile(req: Request, res: Response, relPath: string, mime: string, downloadName?: string) {
  const abs = absolute(relPath);
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw notFound('file_missing');
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (downloadName) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) {
      start = Math.max(0, stat.size - Number(m[2]));
      end = stat.size - 1;
    }
    if (start >= stat.size || end >= stat.size || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(abs, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(abs).pipe(res);
}

export function mimeFor(ext: string) {
  switch (ext.toLowerCase()) {
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.flac': return 'audio/flac';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    default: return 'application/octet-stream';
  }
}
