import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads API_PORT from the shared root .env so the dev proxy targets the API.
 * (Vite's loadEnv is not used on purpose: it would also pick up NODE_ENV=development
 * from that file and produce a development React bundle on `vite build`.)
 */
function apiPort(): string {
  if (process.env.API_PORT) return process.env.API_PORT;
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
    const m = raw.match(/^\s*API_PORT\s*=\s*(\d+)\s*$/m);
    if (m) return m[1];
  } catch { /* no .env: fall back to default */ }
  return '4100';
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://localhost:${apiPort()}`, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
