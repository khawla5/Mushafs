# Mushafs — Production Management System for Recited Mushafs

Mushafs (مصاحف) is a full-stack web application that runs the production of recited mushafs, from the reader's first recording day to distribution. It replaces Google Drive, Word review forms and hand-coloured tracking sheets with one system where:

- every session's status updates automatically from the team's own actions (check-in, upload, submit, ruling),
- every version, note and mujiz decision is kept, and
- reports are instant.

It is built from the *Business Requirements Document — Production Management System for Recited Mushafs*. All of Phase 1 is implemented, plus the light Phase 2 items (distribution log, health indicator, reader journey). See [docs/project-documentation.md](docs/project-documentation.md) for the full requirement traceability matrix, architecture and design decisions.

| Layer    | Technology |
|----------|------------|
| Frontend | React 18 + TypeScript + Vite, plain CSS (RTL-first), Arabic / English |
| Backend  | Node.js 20+ (ES modules), Express, TypeScript, zod validation, pino logging |
| Database | PostgreSQL 16 (SQL migrations, no ORM) |
| Audio    | ffmpeg (bundled via `ffmpeg-static`) creates light MP3 listening copies |

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 or newer (22 LTS recommended) | `node -v` |
| npm | 10+ | ships with Node |
| PostgreSQL | 14+ (16 recommended) | native install **or** Docker (see below) |
| Git | any recent | |
| Visual Studio Code | optional | recommended editor |

## 2. Install dependencies

From the project root (one install covers all workspaces: `database`, `backend` and `frontend`):

```bash
npm install
```

## 3. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`. At minimum:

- `DB_PASSWORD`: the password for the PostgreSQL user.
- `JWT_SECRET`: a long random string. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `DATA_ENCRYPTION_KEY`: 64 hex characters, used to encrypt ID and IBAN data. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

> ⚠️ Never commit `.env`. Keep `DATA_ENCRYPTION_KEY` safe: personal data encrypted with it cannot be read without it.

All variables are documented in [.env.example](.env.example).

## 4. Install and configure PostgreSQL

Choose **one** option.

### Option A: Docker (quickest)

`docker-compose.yml` starts PostgreSQL 16 on `127.0.0.1:5433`, using the credentials from `.env`:

```bash
npm run db:up
```

### Option B: Native PostgreSQL

1. Install PostgreSQL from https://www.postgresql.org/download/ (Windows installer, `brew install postgresql@16`, or `apt install postgresql`).
2. Create the database user and the `mushafs` database (run in `psql` as the `postgres` superuser):

   ```sql
   CREATE USER mushafs WITH PASSWORD 'your-strong-password';
   CREATE DATABASE mushafs OWNER mushafs;
   \c mushafs
   CREATE EXTENSION IF NOT EXISTS citext;
   ```

   The `citext` extension ships with PostgreSQL. Creating it as a superuser avoids permission issues; the first migration also attempts it.
3. In `.env`, set `DB_HOST=localhost`, `DB_PORT=5432`, and `DB_USER`, `DB_PASSWORD` and `DB_NAME` to match.

## 5. Run database migrations (and demo data)

```bash
npm run db:migrate     # creates tables, constraints, indexes, reference data (114 surahs, 60 ahzab, note types, settings)
npm run db:seed        # optional, development only: one demo user per role
```

`npm run db:reset` drops and recreates the schema, then seeds it. It refuses to run when `NODE_ENV=production`.

### Demo accounts (seed only)

All seeded accounts use the password **`Mushafs@2026`** (defined in [database/seed.sql](database/seed.sql)). Change or remove them before any real use.

| Email | Role |
|-------|------|
| admin@mushafs.local | Center management (approves projects, settings, users) |
| supervisor@mushafs.local | General supervisor |
| manager@mushafs.local | Production manager |
| mujiz@mushafs.local | Main mujiz |
| tech@mushafs.local | Technician |
| reader@mushafs.local | Reader |
| reviewer1@mushafs.local / reviewer2@… / reviewer3@… | Reviewers |
| mixing@mushafs.local | Mixing lead |

## 6. Start the application

Run the backend and frontend together:

```bash
npm run dev
```

- Web app: **http://localhost:5173**
- API: http://localhost:4100/api (health check: `/api/health`). The Vite dev server proxies `/api` to it.

To run each part on its own:

```bash
npm run dev -w backend
```

```bash
npm run dev -w frontend
```

## 7. Use it in the browser

Open http://localhost:5173 and sign in with a demo account. A typical first run:

1. **manager**: Projects → New project (type *Mushaf*, reader, riwayah, agreed recording days).
2. **admin**: open the project → *Approve project*. This creates the 60 hizb sessions.
3. **manager**: *Team* tab → assign the mujiz, technician and first and second reviewers (plus an optional mixing lead) → *Start recording*.
4. **reader**, then **mujiz**, then **technician**: *My work* → Check in (the technician records what was done).
5. **technician**: open the session → upload the edited WAV. The session goes to the first reviewer.
6. **reviewer1**: play, place markers, write typed notes → Submit. Then the **mujiz** rules on each note, and so on through the workflow.

Switch the interface language with the 🌐 button (Arabic RTL is the default).

---

## Production build

```bash
npm run build                 # compiles backend (dist/) and frontend (frontend/dist/)
NODE_ENV=production npm start # serves the API and the built frontend from one Node process
```

In production, serve the app over **HTTPS**: session cookies are marked `Secure`. Set `CLIENT_ORIGIN` to the public URL, and point `STORAGE_DIR` to durable storage, such as a mounted Synology share (see BRD NFR *Audio storage*). Back up both PostgreSQL (`pg_dump`) and `STORAGE_DIR`.

## Tests

```bash
npm test
```

The test suite creates and migrates a separate database (`<DB_NAME>_test`) and boots the API. It then drives the full BRD workflow end to end (approval → check-in → upload → reviews → mujiz rulings → corrections → technical listening → mixing → final review split → distribution), plus permission, encryption, reports and escalation checks. PostgreSQL must be running. The database user needs permission to create databases; the Docker setup has it. On a native install, run `ALTER USER mushafs CREATEDB;`, or create the test database yourself and set `TEST_DB_NAME`.

Static type checks:

```bash
npm run typecheck
```

---

## Project structure

```
Mushafs/
├── backend/                  Express REST API (TypeScript, ES modules)
│   ├── src/
│   │   ├── config/           env validation (zod), PostgreSQL pool
│   │   ├── controllers/      request handlers per module
│   │   ├── routes/           routing + request validation schemas
│   │   ├── services/         workflow engine, timers/escalation, reports, dashboard, audio, access control
│   │   ├── middleware/       auth (JWT cookie), validation, uploads, origin check, errors
│   │   └── utils/            crypto (AES-256-GCM), time (UTC+3, working days), logger, HTTP errors
│   └── tests/                end-to-end workflow tests (node:test)
├── frontend/                 React + TypeScript (Vite)
│   ├── public/
│   └── src/
│       ├── components/       layout, audio player, rings, Today card, UI kit
│       ├── pages/            screens (project tabs, session, dashboard, reports, admin …)
│       ├── i18n/             Arabic + English dictionaries, RTL handling
│       ├── lib/              API client, auth, notifications (SSE), formatting (Hijri/Gregorian)
│       └── styles/           design tokens and responsive styles
├── database/
│   ├── migrations/           001 schema · 002 Quran reference data · 003 templates & settings
│   ├── migrate.mjs           migration runner (tracks schema_migrations)
│   ├── seed.sql / seed.mjs   development demo users
│   └── schema.sql            consolidated schema snapshot (reference)
├── docs/project-documentation.md
├── storage/                  uploaded audio & encrypted documents (git-ignored)
├── docker-compose.yml        optional local PostgreSQL
├── .env.example
└── package.json              npm workspaces + root scripts
```

## Root scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | API (watch mode) and web app together |
| `npm run build` / `npm start` | Production build / start |
| `npm run db:up` / `db:down` | Start / stop the Docker PostgreSQL |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load demo users (development) |
| `npm run db:reset` | Drop schema, migrate, seed (development) |
| `npm test` | End-to-end API tests against a test database |
| `npm run typecheck` | TypeScript checks for backend and frontend |

## Troubleshooting

- **`Cannot connect to PostgreSQL`**: check that the database is running (`npm run db:up` or your service), and that `DB_HOST`/`DB_PORT` match.
- **`Database schema missing`**: run `npm run db:migrate`.
- **Port already in use**: change `API_PORT` in `.env` (default 4100). The web app's port is fixed at 5173 in `frontend/vite.config.ts`.
- **Light listening copy shows "unavailable"**: ffmpeg could not run. The original file is streamed instead. Reinstall dependencies with `npm install` so `ffmpeg-static` downloads its binary.
