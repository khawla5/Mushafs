import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM for personal data (ID, IBAN, ID documents) - NFR "Personal data" (PDPL).
const key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');

export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptText(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [ver, ivB, tagB, dataB] = payload.split(':');
  if (ver !== 'v1' || !ivB || !tagB || dataB === undefined) throw new Error('Unsupported ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

/** Encrypts a binary buffer: [12-byte iv][16-byte tag][ciphertext] */
export function encryptBuffer(buf: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(buf: Buffer): Buffer {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

/** Masks all but the last 4 characters. */
export function mask(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}
