import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { badRequest } from '../utils/http.js';

export const tmpDir = path.join(env.storageDir, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.upload`),
});

const AUDIO_EXT = new Set(['.wav', '.mp3', '.flac', '.m4a', '.aac']);

/** FIL-01: full quality session upload (WAV expected for raw; mixed may be any listed audio). */
export const audioUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!AUDIO_EXT.has(ext)) return cb(badRequest('unsupported_audio_format'));
    cb(null, true);
  },
}).single('file');

const DOC_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

/** RDR-01: ID document (small, encrypted after upload). */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!DOC_EXT.has(ext)) return cb(badRequest('unsupported_document_format'));
    cb(null, true);
  },
}).single('file');
