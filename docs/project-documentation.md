# Mushafs: Project Documentation

This document records how the BRD (*Business Requirements Document — Production Management System for Recited Mushafs*) was analysed and implemented. It covers:

- scope and the requirement traceability matrix
- roles and permissions
- architecture, data model and workflow engine
- API reference
- every interpretation made where the BRD leaves an open question

---

## 1. Scope

The BRD splits the work into **Phase 1** (internal mushaf production), **Phase 2** (expansion and distribution) and **Later** (separate projects). The agreed scope for this build is:

- **All of Phase 1**, fully implemented.
- **Light Phase 2**: items that reuse Phase 1 data and need no open answers from the center. These are the distribution log (DST-01), the health indicator (12.3), the reader journey timeline (RDR-05) and the *Distribution and reach* report.
- **Not implemented**: other Phase 2 items and everything listed under "Later" (section 4 lists them).

The BRD describes a mobile app *and* a website. This deliverable is a single **responsive web application**, usable on phones, tablets and desktops. Native iOS and Android apps are not part of it.

## 2. Requirement traceability

Status: ✅ implemented · 🟡 partly / implemented with an interpretation (see §8) · ⏭ deferred (out of agreed scope)

### 9.1 Projects and teams
| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| PRJ-01 | Create project: type, reader/announcer, riwayah | ✅ | `POST /api/projects`, *New project* page |
| PRJ-02 | Mushaf template: 60 sessions with predefined ranges; slots created on approval | ✅ | `approveProject()` uses the `hizbs` table (60 ahzab, Hafs/Madinah) |
| PRJ-03 | Hadith template: set or open count, text prep & approval steps | 🟡 | Hadith/recitation projects take a set session count. Text-preparation steps are Phase 2 and not built |
| PRJ-04 | Assign team; recording cannot start until complete | ✅ | Team tab; `startProject()` enforces BR-01 |
| PRJ-05 | Notify each member on assignment | ✅ | `team_assigned` notification |
| PRJ-06 | Agreed recording days per project | ✅ | `projects.recording_weekdays`, editable by management |
| PRJ-07 | Change members mid-project, keeping history | ✅ | `project_members` history rows; open work moves to the new member |

### 9.2 Check-in and excuses
| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| ATT-01 | "Today" screen: next session (number, range), Check-in & Excuse | ✅ | `TodayCard`, `GET /projects/:id/today` |
| ATT-02 | Order reader → mujiz → technician; buttons disabled until previous | ✅ | `checkIn()` + UI state |
| ATT-03 | Technician check-in = recorded; starts editing timer | ✅ | `markSessionsRecorded()` |
| ATT-04 | Excuse window after technician check-in, configurable cutoff | 🟡 | Cutoff modes "hours after check-in" / "fixed time"; see §8.4 |
| ATT-05 | Excuse for a date range with a reason | ✅ | Excuse dialog |
| ATT-06 | Technician records outcome (full / two / corrections only / incomplete) | ✅ | Outcome dialog; "two sessions" records two |
| ATT-07 | Attendance & excuse log per person and project | ✅ | Recording tab, Profile, `GET /attendance` |

### 9.3 Sessions and files
| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| FIL-01 | Upload edited session at full quality (WAV) | ✅ | Raw uploads must be `.wav` |
| FIL-02 | Automatic light listening copy | ✅ | ffmpeg → MP3 (`LIGHT_COPY_BITRATE`), duration read |
| FIL-03 | Each upload = new version; one approved; earlier kept | ✅ | Partial unique index `versions_one_approved` |
| FIL-04 | No files sent; everyone accesses the same file by permission | ✅ | Streaming & download endpoints check project access |
| FIL-05 | Approved raw and mixed version linked per session | ✅ | `versions.kind` raw/mixed on the same session |
| FIL-06 | Replace in place after final-review corrections, old kept | ✅ | New mixed version becomes approved |

### 9.4 Reviews and notes
| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| REV-01 | Auto-route to reviewer with notification and "unread" marker | ✅ | Blue dot until first opened |
| REV-02 | Player: time display, −10 s, +30 s, smooth scrubbing | ✅ | `AudioPlayer` (HTTP range streaming, drag scrubbing, speed) |
| REV-03 | Marker at a second, or manual time | ✅ | "Mark at mm:ss" + manual field |
| REV-04 | Note fields: ayah limited to session range, time, type, text | ✅ | Validated client- and server-side |
| REV-05 | General notes on the reader with scholarly references | ✅ | *General notes* tab |
| REV-06 | Round result "no notes" or notes, then Submit | ✅ | |
| REV-07 | Rounds: first, second, technical, final, extra | ✅ | Extra round added by management |
| REV-08 | Split final review (whole/half/third/quarter), every session covered | ✅ | Coverage validated server-side |
| REV-09 / REV-10 | Mushaf pages beside player / page sync | ⏭ | Phase 2 / Later |

### 9.5 Mujiz decisions and corrections
| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| DEC-01 | Tapping a note plays from 10 s before | ✅ | Also switches to the note's version |
| DEC-02 | Four decisions | ✅ | accept / reject / listen in studio / refer to technician |
| DEC-03 | Notify technician of accepted notes; list corrections | ✅ | `corrections_required` + corrections panel |
| DEC-04 | Technical notes straight to technician (setting) | ✅ | `technical_notes_to_technician` |
| DEC-05 | Keep original note, decision, who/when, status (open/done/verified) | ✅ | `note_decisions` history; `corrections.status` |
| DEC-06 | Pass a no-corrections session automatically or with one click (setting) | ✅ | `auto_pass_no_notes` |

### 9.6 Recording quality and mixing
| ID | Requirement | Status |
|----|-------------|--------|
| MIX-01 | Notify mixing lead on project start; first session for quality check | ✅ |
| MIX-02 | Later pick a random session to rate | ✅ Automatic once *N* sessions are uploaded (setting), plus on-demand requests |
| MIX-03 | Approve with a tick, or "not suitable" with notes | ✅ |
| MIX-04 | When all raw ready, mixing lead pulls them and uploads mixed | ✅ ZIP of approved raws; per-session mixed upload |
| MIX-05 | Output versions (by hizb, by surah…) | ⏭ Phase 2. The distribution log records a free-text *output version* |

### 9.7 Timers and escalation
| ID | Requirement | Status |
|----|-------------|--------|
| TMR-01 | Allowed time per stage, set by management | ✅ Settings page |
| TMR-02 | Two-level escalation, orange then red, worker → PM, supervisor notified | ✅ See §6.3 |
| TMR-03 | Indicator visible in lists, plus notifications | ✅ Dots in grid, lists, My work |
| TMR-04 | Every transition timestamped from actions | ✅ `session_events` |
| TMR-05 | Keep the deadlines in force at each stage | ✅ Each timer row stores the hours in force when it started |

### 9.8 Readers · 9.9 Distribution · 9.10 Administration
| ID | Requirement | Status |
|----|-------------|--------|
| RDR-01 | Reader profile: upload ID and IBAN in the app | ✅ AES-256-GCM encrypted, owner + admin only, access audited |
| RDR-02..04, RDR-06 | Nominations, evaluations, development program, publishing | ⏭ Phase 2 / Later |
| RDR-05 | Reader journey timeline | ✅ (light Phase 2) |
| DST-01 | Distribution log per mushaf | ✅ (light Phase 2) |
| DST-02..05 | Partner portal, partner details map, broadcast reporting, public platform | ⏭ |
| ADM-01 | Manage users, roles and permissions | ✅ |
| ADM-02 | Control panel for settings | ✅ All §11.2 settings |
| ADM-03 | Audit log of every change and decision | ✅ |
| ADM-04 | Instant notifications | 🟡 In-app, pushed instantly over Server-Sent Events. Native mobile push needs the mobile app |

### Business rules (11.1)
| Rule | Enforcement |
|------|-------------|
| BR-01 Full team before start | `startProject()` → `team_incomplete` |
| BR-02 Next session = after last recorded | `today` picks the first `pending` session in order |
| BR-03 Check-in order | `checkIn()` |
| BR-04/05 Excuse cutoff; late excuses accepted and flagged | `cutoffFor()`, `excuses.is_late` |
| BR-06 No target end date; commitment by agreed days | Recording ring and *Recording commitment* report |
| BR-07 No timer on recording | Timers start at editing |
| BR-08 Only the main mujiz decides | `decide()` checks the mujiz seat |
| BR-09 One approved version, never deleted | DB index; no delete endpoint for versions |
| BR-10 Mixing only when all sessions are approved raw | Project moves to `mixing` automatically; mixed uploads rejected before |
| BR-11 Later-caught error counts against earlier reviewer | `MISSED_SQL` in `reports.service.ts` |
| BR-12 Not counted if ayah re-recorded after their review | Corrections flagged *re-recorded* with an ayah range |
| BR-13 Rejected notes are not errors; rejection rate tracked | *Review quality* report |

### Reports and dashboard (section 12)
All ten Phase 1 reports are available under **Reports**, with CSV export: production status, stage times, recording commitment, clear errors, reader quality, review quality, recording & editing quality, speed vs quality, workload, and annual output. *Distribution and reach* is also included. The dashboard has the **detailed** (management) and **general** views, the rings defined in 12.2, and the health indicator from 12.3.

## 3. Roles and permissions

Global roles (`users.roles`, a user may hold several): `admin` (center management), `supervisor`, `production_manager`, `mujiz`, `technician`, `reader`, `reviewer`, `mixing_lead`.

Project seats (`project_members.team_role`): `mujiz`, `technician`, `reviewer1`, `reviewer2`, `final_reviewer` (several allowed), `mixing_lead` (optional; if empty, every mixing lead can act). The reader is `projects.reader_id`.

| Principle (BRD §6) | Implementation |
|--------------------|----------------|
| People see only their own projects; no access before approval | `assertProjectView()`: management sees all; others must be the reader or a current member, and the project must be approved |
| Notes visible to everyone involved; only the main mujiz decides | Session detail open to project viewers; `decide` requires the mujiz seat |
| Detailed dashboard for management only | `/dashboard?view=detailed` falls back to the general view for others; the general view has no names or performance data |
| Personal data only for owner and admin | `/auth/private/:userId`; values masked unless `reveal=true`; admin views are audited |

Action rights at a glance: **admin** approves and cancels projects, manages users, settings and note types. **admin / production manager** create projects, assign teams, start projects, set up the final review, forward final notes and complete projects. **Management** (including supervisor) see reports, the detailed dashboard and the distribution log, add extra rounds, and accept or reject excuses.

## 4. Not implemented (deferred by scope)

PRJ-03 text-preparation steps, REV-09/10 (mushaf pages), MIX-05 (output version generation), RDR-02..04 and RDR-06, DST-02..05, the points system (12.4), the community of huffaz (HFZ-01..08), native mobile apps and push notifications, and the center's screen presentation. The schema was designed to carry these: project types and templates, round types, and partner fields on distributions.

## 5. Architecture

```
Browser (React SPA, RTL/LTR) ── /api (JSON, httpOnly cookie) ──► Express API ──► PostgreSQL
        ▲                                                        │
        └──── Server-Sent Events (instant notifications) ◄───────┤
                                                                 ├─► storage/ (audio, encrypted docs)
                                                                 └─► ffmpeg (light copies)
```

- **Backend** (`backend/src`): routes validate input with zod, controllers handle requests, and services hold the business logic. The services are:
  - `workflow.service.ts`: the state machine
  - `timers.service.ts`: deadlines and escalation; a scheduler runs every `TIMER_INTERVAL_SECONDS`
  - `reports.service.ts` and `dashboard.service.ts`
  - `access.service.ts`: permissions
  - `audio.service.ts`: storage, transcoding and range streaming
  - `notifications.service.ts`: stored notifications plus the SSE hub

  Every state-changing workflow action runs inside a single PostgreSQL transaction with row locks (`SELECT … FOR UPDATE`).
- **Frontend** (`frontend/src`): React Router pages and a small UI kit with no CSS framework. All strings are in `i18n/ar.ts` and `i18n/en.ts`, and the `dir` attribute switches RTL/LTR. Dates show Gregorian and Hijri (Umm al-Qura) together.
- **Database** (`database/`): plain SQL migrations applied by `migrate.mjs`, tracked in `schema_migrations`. There is no ORM, so constraints live in the database.

### Security
- Passwords are hashed with bcrypt (cost 12; 10 in the seed).
- Sessions use a JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). There is also an `Origin` check on state-changing requests, and login is rate-limited.
- Helmet adds security headers including a CSP, and there is a global API rate limit.
- All SQL is parameterised. Request bodies are validated with zod `.strict()` schemas where fields are updatable.
- Uploads are restricted by extension and size (`MAX_UPLOAD_MB`). Files are stored outside the web root and streamed only after permission checks, and storage paths are never exposed to clients.
- Personal data (national ID, IBAN, ID document) is encrypted with AES-256-GCM using `DATA_ENCRYPTION_KEY`, in line with PDPL "encryption and restricted access from day one".
- `audit_log` records logins, every create, update and decision, downloads and personal-data access.

## 6. Data model and workflow

### 6.1 Main tables
`users`, `user_private_data`, `projects`, `templates`, `project_members`, `sessions`, `versions`, `review_rounds`, `notes`, `note_decisions`, `corrections`, `general_notes`, `recording_sittings`, `checkins`, `sitting_sessions`, `excuses`, `quality_ratings`, `final_review_assignments`, `stage_timers`, `session_events`, `distributions`, `notifications`, `audit_log`, `settings`, `note_types`, and the reference tables `surahs` and `hizbs`. Full DDL: [`database/migrations/001_core_schema.sql`](../database/migrations/001_core_schema.sql); snapshot: [`database/schema.sql`](../database/schema.sql).

### 6.2 Session state machine
```
pending ──technician check-in──► editing ──upload WAV──► in_review(first)
in_review ──submit, no notes──► awaiting_pass ──one click──► next round      (auto if setting on)
in_review ──submit, notes──► in_decision ──all ruled──► in_corrections ──upload corrected──► next round
                                         └─all rejected──► awaiting_pass / next round
rounds: first (reviewer1) → second (reviewer2) → technical (technician) [+ extra rounds on demand]
after the last round ──► ready_for_mixing
all sessions ready ──► project "mixing" ──mixed upload──► mixed
final split ──► in_review(final) ──notes──► pm_forward ──PM forwards──► in_decision ──► in_corrections
             ──corrected mixed upload──► done          ──no notes──► awaiting_pass ──► done
all sessions done ──► project "distribution" ──► completed
```
Project statuses: `pending_approval → approved → recording → mixing → final_review → distribution → completed` (or `cancelled`).

### 6.3 Timers and escalation
Each stage of work (editing, review, decision, corrections, quality rating, mixing) opens a `stage_timers` row. The row stores the allowed hours, grace periods and day counting **in force at that moment** (TMR-05). The scheduler raises the alert level:

| Level | When | Who is notified |
|-------|------|-----------------|
| 1 orange | allowed time passed | the worker |
| 2 red | + orange grace | the worker; escalated to production managers (their "orange") |
| 3 PM red | + production-manager grace | production managers and the general supervisor |

The dashboard rings never use orange or red; those colours are reserved for alerts.

## 7. API reference (summary)

All endpoints are under `/api` and return JSON. Errors have the form `{ "error": { "code", "message", "details?" } }`, and the codes are translated in the UI.

| Area | Endpoints |
|------|-----------|
| Auth & profile | `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /auth/me`, `GET/PUT /auth/private/:userId` (`me` or id), `POST/GET /auth/private/:userId/document` |
| Users (ADM-01) | `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password` |
| Projects | `GET/POST /projects`, `GET/PATCH /projects/:id`, `POST /projects/:id/{approve,start,complete,cancel}`, `GET /templates` |
| Team | `POST /projects/:id/team`, `DELETE /projects/:id/team/:memberId`, `GET /projects/:id/team/history` |
| Sessions | `GET /projects/:id/sessions`, `GET /sessions/:id`, `POST /sessions/:id/versions` (multipart `file`, `kind`), `POST /sessions/:id/{pass,extra-round,forward-notes}` |
| Audio | `GET /versions/:id/stream[?quality=original]` (Range supported), `GET /versions/:id/download` |
| Reviews | `POST /rounds/:id/notes`, `PATCH/DELETE /notes/:id`, `POST /rounds/:id/submit`, `POST /notes/:id/decision` |
| Corrections | `PATCH /corrections/:id`, `POST /corrections/:id/verify` |
| Attendance | `GET /projects/:id/today`, `POST /projects/:id/checkin`, `POST /projects/:id/excuses`, `PATCH /excuses/:id`, `GET /attendance` |
| Quality & mixing | `GET /projects/:id/quality`, `POST /projects/:id/quality/random`, `POST /quality/:id/rate`, `GET /projects/:id/raw-archive` |
| Final review | `GET/POST /projects/:id/final-review` |
| Distribution | `GET/POST /projects/:id/distributions`, `PATCH/DELETE /distributions/:id` |
| Home, dashboard, reports | `GET /me/work`, `GET /dashboard?view=detailed\|general`, `GET /reports`, `GET /reports/:name?project_id=&year=` |
| Admin | `GET/PUT /settings`, `GET/POST /note-types`, `PATCH /note-types/:id`, `GET /audit` |
| Notifications | `GET /notifications`, `GET /notifications/stream` (SSE), `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Misc | `GET /health`, `GET /quran/surahs`, `GET /projects/:id/{general-notes,journey}` |

## 8. Interpretations of open questions and unclear points

The BRD lists 24 open questions (§17). Where a choice was unavoidable, the most conservative, configurable option was taken. Each one below can be changed with the center.

1. **Recording days (Q1)** are fixed weekdays per project, set by the production manager. Without them a project cannot start.
2. **Recording tracking (Q2)** uses attendance and excuses only. Timers cover editing, reviews, decisions, corrections, quality rating and mixing (BR-07).
3. **Hosting and storage (Q3)**: audio is stored under `STORAGE_DIR`, which can point at a mounted Synology share.
4. **Excuse cutoff (Q5, ATT-04)** is one global setting:
   - *Fixed mode*: the cutoff is HH:MM on the day before the excused date.
   - *Hours mode*: the cutoff is *N* hours after the technician's last check-in. This applies only when no agreed recording day falls between that check-in and the excused date; otherwise it is the start of the excused day.

   Late excuses are accepted and flagged (BR-05). Management can mark an excuse as rejected, and the commitment ring and report count only accepted excuses.
5. **Check-in location (Q6)** is not restricted.
6. **Day counting (Q7)**: calendar or working days (configured weekend). Holidays and Ramadan are not modelled yet.
7. **Alert periods (Q8)** use one orange grace and one production-manager grace for all stages. Allowed time is set per stage.
8. **Re-recordings (Q9)**: the technician marks a correction as *re-recorded* with its ayah range when uploading the fix. The main mujiz verifies corrections (`done → verified`).
9. **Second reviewer sees first reviewer's notes (Q10)**: yes. The BRD says notes are visible to everyone involved.
10. **Final review split (Q12)** uses contiguous session ranges computed evenly (e.g. 1–30 / 31–60).
11. **BR-12 (Q13)** is applied as proposed.
12. **"Listen in studio"** keeps the note open. The mujiz later records accept or reject, and the full decision history is kept.
13. **Corrections after final review** are fixed by uploading a corrected mixed file (mixing lead or technician). It replaces the session in place (FIL-06) and the session is then done.
14. **Who passes a no-notes session** (one-click mode): the technician or management.
15. **Dashboard health thresholds** are not in the BRD. Each ring maps to green (≥ 90 %), blue (70–89 %) or red (< 70 %). Project health is the worst dimension, shown with its reason. Any open red alert also makes the project red.
16. **Missed errors** (BR-11) count accepted notes (accept or refer to technician) found in a later round of the same session. They are charged to every earlier reviewer of that session, except when BR-12 applies.
17. **Time zone**: the center operates on Saudi time (UTC+3) for "today", recording days and working-day counting.

## 9. Testing and quality assurance

- `npm test` runs 23 end-to-end tests against a real PostgreSQL test database. Areas covered:
  - authentication, validation, CSRF origin check
  - mushaf template (60 hizb ranges)
  - BR-01, check-in order, excuses
  - uploads, light copy and range streaming
  - notes and ayah validation
  - technical-note routing, one-click pass
  - mujiz-only decisions with history, corrections and re-recording
  - missed-error accounting (BR-11/13), mixing (BR-10), quality ratings
  - final-review coverage and PM forwarding, replacement in place, distribution, journey
  - all reports, dashboard views
  - encrypted personal data and access control, settings permissions
  - three-level escalation
- `npm run typecheck` checks the backend and frontend with TypeScript strict mode.
- The UI was exercised in a browser across roles (production manager, mujiz, reviewer, supervisor, reader), in Arabic RTL and English LTR, and at desktop and phone widths.
