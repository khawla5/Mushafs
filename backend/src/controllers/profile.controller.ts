import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { one, query } from '../config/db.js';
import { env } from '../config/env.js';
import { hasRole } from '../middleware/auth.js';
import { decryptBuffer, decryptText, encryptBuffer, encryptText, mask } from '../utils/crypto.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { audit } from '../services/audit.service.js';
import { privateRoot } from '../services/audio.service.js';

/**
 * RDR-01 + permission principle: personal data (ID, IBAN) is visible only to its owner
 * and the responsible admin function. Values are encrypted at rest.
 */
function targetUserId(req: Request) {
  const raw = req.params.userId;
  if (!raw || raw === 'me') return req.user!.id;
  const id = Number(raw);
  if (id !== req.user!.id && !hasRole(req.user, 'admin')) throw forbidden('personal_data_restricted');
  return id;
}

export async function getPrivate(req: Request, res: Response) {
  const userId = targetUserId(req);
  const row = await one('SELECT * FROM user_private_data WHERE user_id = $1', [userId]);
  const reveal = req.query.reveal === 'true';
  const nid = decryptText(row?.national_id_enc);
  const iban = decryptText(row?.iban_enc);
  if (reveal && userId !== req.user!.id) await audit(req.user!.id, 'personal_data_viewed', 'user', userId, null, undefined, req);
  res.json({
    national_id: reveal ? nid : mask(nid),
    iban: reveal ? iban : mask(iban),
    has_document: !!row?.id_document_path,
    document_name: row?.id_document_name ?? null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function updatePrivate(req: Request, res: Response) {
  const userId = targetUserId(req);
  const { national_id, iban } = req.body as { national_id?: string; iban?: string };
  await query(
    `INSERT INTO user_private_data (user_id, national_id_enc, iban_enc) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       national_id_enc = COALESCE(EXCLUDED.national_id_enc, user_private_data.national_id_enc),
       iban_enc = COALESCE(EXCLUDED.iban_enc, user_private_data.iban_enc),
       updated_at = now()`,
    [userId, national_id ? encryptText(national_id) : null, iban ? encryptText(iban) : null],
  );
  await audit(req.user!.id, 'personal_data_updated', 'user', userId, { fields: Object.keys(req.body) }, undefined, req);
  res.json({ ok: true });
}

export async function uploadDocument(req: Request, res: Response) {
  const userId = targetUserId(req);
  if (!req.file) throw badRequest('file_required');
  const name = `${userId}-${crypto.randomBytes(8).toString('hex')}.bin`;
  await fsp.writeFile(path.join(privateRoot, name), encryptBuffer(req.file.buffer));
  const prev = await one('SELECT id_document_path FROM user_private_data WHERE user_id = $1', [userId]);
  await query(
    `INSERT INTO user_private_data (user_id, id_document_path, id_document_name, id_document_mime) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET id_document_path = $2, id_document_name = $3, id_document_mime = $4, updated_at = now()`,
    [userId, path.join('private', name), req.file.originalname, req.file.mimetype],
  );
  if (prev?.id_document_path) await fsp.unlink(path.join(env.storageDir, prev.id_document_path)).catch(() => undefined);
  await audit(req.user!.id, 'id_document_uploaded', 'user', userId, null, undefined, req);
  res.status(201).json({ ok: true });
}

export async function downloadDocument(req: Request, res: Response) {
  const userId = targetUserId(req);
  const row = await one('SELECT id_document_path, id_document_name, id_document_mime FROM user_private_data WHERE user_id = $1', [userId]);
  if (!row?.id_document_path) throw notFound('document_not_found');
  const buf = decryptBuffer(await fsp.readFile(path.join(env.storageDir, row.id_document_path)));
  if (userId !== req.user!.id) await audit(req.user!.id, 'id_document_viewed', 'user', userId, null, undefined, req);
  res.setHeader('Content-Type', row.id_document_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.id_document_name)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
}
