/**
 * Test harness: creates/migrates/seeds a dedicated test database (<DB_NAME>_test by default),
 * boots the Express app on a random port and provides a cookie-aware HTTP client per user.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
dotenv.config({ path: path.join(root, '.env') });

export const TEST_DB = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
export const PASSWORD = 'Mushafs@2026';

export async function prepareDatabase() {
  const admin = new pg.Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: 'postgres',
  });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${TEST_DB.replace(/"/g, '')}"`);
  await admin.end();
  const env = { ...process.env, DB_NAME: TEST_DB, NODE_ENV: 'test' };
  execFileSync(process.execPath, [path.join(root, 'database', 'migrate.mjs'), '--reset'], { env, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(root, 'database', 'seed.mjs')], { env, stdio: 'pipe' });
}

let server: Server;
export let baseUrl = '';

export async function startServer() {
  process.env.DB_NAME = TEST_DB;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.STORAGE_DIR = path.join(root, 'storage', 'test');
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function stopServer() {
  const { pool } = await import('../src/config/db.js');
  await new Promise((r) => server.close(r));
  await pool.end();
}

export async function sql(text: string, params: unknown[] = []) {
  const { pool } = await import('../src/config/db.js');
  return (await pool.query(text, params)).rows;
}

export class Client {
  cookie = '';
  constructor(public email: string) {}

  async login() {
    const r = await this.req('POST', '/api/auth/login', { email: this.email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login failed for ${this.email}: ${r.status} ${JSON.stringify(r.body)}`);
    return this;
  }

  async req(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: any;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, body: data as any, headers: res.headers };
  }

  get(url: string, headers?: Record<string, string>) { return this.req('GET', url, undefined, headers); }
  post(url: string, body?: unknown) { return this.req('POST', url, body ?? {}); }
  patch(url: string, body?: unknown) { return this.req('PATCH', url, body); }
  put(url: string, body?: unknown) { return this.req('PUT', url, body); }
  del(url: string) { return this.req('DELETE', url); }

  async upload(sessionId: number, kind: 'raw' | 'mixed', seconds = 2, name = 'session.wav') {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', new Blob([makeWav(seconds)], { type: 'audio/wav' }), name);
    return this.req('POST', `/api/sessions/${sessionId}/versions`, fd);
  }
}

/** Generates a small 16-bit mono PCM WAV with a 440 Hz tone. */
export function makeWav(seconds: number, rate = 8000) {
  const samples = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
