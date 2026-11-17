-- =====================================================================
-- Mushafs - core schema (BRD section 7 "Core concepts")
-- project -> sessions -> versions -> review rounds -> notes -> decisions
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
  'admin',               -- center management: approves readers & projects, settings
  'supervisor',          -- general supervisor: sees everything, last escalation level
  'production_manager',  -- assigns teams, handles escalations, final-review notes
  'mujiz',               -- main mujiz: sole decision maker on notes
  'technician',          -- uploads sessions, corrections, technical listening
  'reader',              -- reciter: check-in, excuses, profile, journey
  'reviewer',            -- first / second / final reviewer
  'mixing_lead'          -- quality samples, mixing
);

CREATE TYPE project_type   AS ENUM ('mushaf', 'hadith', 'recitation');
CREATE TYPE project_status AS ENUM (
  'pending_approval', 'approved', 'recording', 'mixing', 'final_review',
  'distribution', 'completed', 'cancelled'
);
CREATE TYPE team_role AS ENUM ('mujiz', 'technician', 'reviewer1', 'reviewer2', 'final_reviewer', 'mixing_lead');

CREATE TYPE session_stage AS ENUM (
  'pending',          -- not recorded yet
  'editing',          -- recorded; technician editing & uploading (timer)
  'in_review',        -- a review round is open (first / second / technical / extra / final)
  'awaiting_pass',    -- round finished with no corrections; waiting for one-click pass
  'pm_forward',       -- final-review notes waiting for production manager to forward to mujiz
  'in_decision',      -- notes waiting for the main mujiz
  'in_corrections',   -- accepted notes waiting for technician corrections / new upload
  'ready_for_mixing', -- raw approved and ready for mixing
  'mixed',            -- mixed version uploaded, waiting for final review
  'done'              -- final review passed
);

CREATE TYPE version_kind   AS ENUM ('raw', 'mixed');
CREATE TYPE light_status   AS ENUM ('pending', 'ready', 'failed', 'not_needed');
CREATE TYPE round_type     AS ENUM ('first', 'second', 'technical', 'extra', 'final');
CREATE TYPE round_status   AS ENUM ('open', 'submitted', 'cancelled');
CREATE TYPE round_result   AS ENUM ('no_notes', 'notes');
CREATE TYPE mujiz_decision AS ENUM ('accept', 'reject', 'studio', 'technician');
CREATE TYPE correction_status AS ENUM ('open', 'done', 'verified');
CREATE TYPE sitting_outcome   AS ENUM ('full', 'two_sessions', 'corrections_only', 'incomplete');
CREATE TYPE excuse_status     AS ENUM ('accepted', 'rejected');
CREATE TYPE quality_kind      AS ENUM ('first', 'random');
CREATE TYPE quality_verdict   AS ENUM ('approved', 'not_suitable');
CREATE TYPE timer_stage AS ENUM ('editing', 'review', 'quality_rating', 'mixing', 'decision', 'corrections');

-- ---------------------------------------------------------------------
-- Users, roles, personal data
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  phone         TEXT,
  roles         user_role[] NOT NULL CHECK (cardinality(roles) > 0),
  locale        TEXT NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_roles_gin ON users USING GIN (roles);

-- RDR-01 + NFR "Personal data": ID & IBAN encrypted at rest (AES-256-GCM in the app layer)
CREATE TABLE user_private_data (
  user_id            BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  national_id_enc    TEXT,
  iban_enc           TEXT,
  id_document_path   TEXT,          -- encrypted file on disk
  id_document_name   TEXT,
  id_document_mime   TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Configuration (ADM-02, section 11.2)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE note_types (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  severity     SMALLINT NOT NULL DEFAULT 1,  -- higher = more serious
  is_clear_error BOOLEAN NOT NULL DEFAULT FALSE, -- lahn jali
  is_technical BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Quran reference data (surahs, 60 ahzab)
-- ---------------------------------------------------------------------
CREATE TABLE surahs (
  number      SMALLINT PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  ayah_count  SMALLINT NOT NULL CHECK (ayah_count > 0)
);

CREATE TABLE hizbs (
  number       SMALLINT PRIMARY KEY CHECK (number BETWEEN 1 AND 60),
  start_surah  SMALLINT NOT NULL REFERENCES surahs(number),
  start_ayah   SMALLINT NOT NULL,
  end_surah    SMALLINT NOT NULL REFERENCES surahs(number),
  end_ayah     SMALLINT NOT NULL
);

-- ---------------------------------------------------------------------
-- Templates & projects (PRJ-01..07)
-- ---------------------------------------------------------------------
CREATE TABLE templates (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  project_type    project_type NOT NULL,
  name_ar         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  fixed_session_count SMALLINT,   -- 60 for mushaf; NULL = set per project / open
  uses_hizb_ranges BOOLEAN NOT NULL DEFAULT FALSE,
  review_rounds   round_type[] NOT NULL DEFAULT ARRAY['first','second','technical']::round_type[]
);

CREATE TABLE projects (
  id                 BIGSERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL CHECK (length(trim(title)) > 0),
  project_type       project_type NOT NULL,
  template_id        INT NOT NULL REFERENCES templates(id),
  riwayah            TEXT NOT NULL,
  reader_id          BIGINT NOT NULL REFERENCES users(id),
  status             project_status NOT NULL DEFAULT 'pending_approval',
  session_count      SMALLINT NOT NULL CHECK (session_count > 0),
  recording_weekdays SMALLINT[] NOT NULL DEFAULT '{}',    -- 0=Sunday..6=Saturday (PRJ-06)
  sessions_per_day   SMALLINT NOT NULL DEFAULT 1 CHECK (sessions_per_day BETWEEN 1 AND 4),
  description        TEXT,
  created_by         BIGINT NOT NULL REFERENCES users(id),
  approved_by        BIGINT REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  recording_completed_at TIMESTAMPTZ,
  mixing_started_at  TIMESTAMPTZ,
  final_review_started_at TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX projects_reader_idx ON projects(reader_id);

-- Team with history (PRJ-04, PRJ-07): removed_at IS NULL = current member
CREATE TABLE project_members (
  id          BIGSERIAL PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  team_role   team_role NOT NULL,
  assigned_by BIGINT NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_by  BIGINT REFERENCES users(id),
  removed_at  TIMESTAMPTZ,
  change_reason TEXT
);
-- one active person per single-seat role
CREATE UNIQUE INDEX project_members_one_active_seat
  ON project_members(project_id, team_role)
  WHERE removed_at IS NULL AND team_role <> 'final_reviewer';
CREATE UNIQUE INDEX project_members_no_dupe_final
  ON project_members(project_id, user_id, team_role)
  WHERE removed_at IS NULL;
CREATE INDEX project_members_user_idx ON project_members(user_id) WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------
-- Sessions & versions (FIL-01..06)
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number          SMALLINT NOT NULL CHECK (number > 0),
  title           TEXT,
  start_surah     SMALLINT REFERENCES surahs(number),
  start_ayah      SMALLINT,
  end_surah       SMALLINT REFERENCES surahs(number),
  end_ayah        SMALLINT,
  stage           session_stage NOT NULL DEFAULT 'pending',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_round_id BIGINT,
  next_round_index SMALLINT NOT NULL DEFAULT 0, -- index into template review_rounds
  recorded_at     TIMESTAMPTZ,
  ready_for_mixing_at TIMESTAMPTZ,
  mixed_at        TIMESTAMPTZ,
  done_at         TIMESTAMPTZ,
  UNIQUE (project_id, number)
);
CREATE INDEX sessions_project_stage_idx ON sessions(project_id, stage);

CREATE TABLE versions (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind          version_kind NOT NULL,
  version_no    INT NOT NULL,
  file_path     TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  duration_sec  NUMERIC(10,2),
  light_path    TEXT,
  light_status  light_status NOT NULL DEFAULT 'pending',
  is_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  upload_reason TEXT,            -- 'initial', 'corrections', 'final_corrections', ...
  uploaded_by   BIGINT NOT NULL REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, kind, version_no)
);
-- BR-09: exactly one approved version per kind; old ones are kept
CREATE UNIQUE INDEX versions_one_approved ON versions(session_id, kind) WHERE is_approved;

-- ---------------------------------------------------------------------
-- Reviews, notes, decisions, corrections (REV, DEC)
-- ---------------------------------------------------------------------
CREATE TABLE final_review_assignments (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_id  BIGINT NOT NULL REFERENCES users(id),
  session_from SMALLINT NOT NULL,
  session_to   SMALLINT NOT NULL,
  split_label  TEXT NOT NULL,      -- whole / half / third / quarter
  created_by   BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (session_from <= session_to)
);

CREATE TABLE review_rounds (
  id           BIGSERIAL PRIMARY KEY,
  session_id   BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version_id   BIGINT NOT NULL REFERENCES versions(id),
  round_type   round_type NOT NULL,
  round_no     SMALLINT NOT NULL,       -- sequence within session
  reviewer_id  BIGINT NOT NULL REFERENCES users(id),
  status       round_status NOT NULL DEFAULT 'open',
  result       round_result,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_opened_at TIMESTAMPTZ,          -- REV-01 unread marker
  submitted_at TIMESTAMPTZ,
  final_assignment_id BIGINT REFERENCES final_review_assignments(id),
  UNIQUE (session_id, round_no)
);
CREATE INDEX review_rounds_reviewer_open ON review_rounds(reviewer_id) WHERE status = 'open';
ALTER TABLE sessions ADD CONSTRAINT sessions_current_round_fk
  FOREIGN KEY (current_round_id) REFERENCES review_rounds(id) ON DELETE SET NULL;

CREATE TABLE notes (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_id      BIGINT NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  version_id    BIGINT NOT NULL REFERENCES versions(id),
  author_id     BIGINT NOT NULL REFERENCES users(id),
  note_type_id  INT NOT NULL REFERENCES note_types(id),
  surah         SMALLINT NOT NULL REFERENCES surahs(number),
  ayah          SMALLINT NOT NULL CHECK (ayah > 0),
  timestamp_sec NUMERIC(10,2) NOT NULL CHECK (timestamp_sec >= 0),
  body          TEXT NOT NULL CHECK (length(trim(body)) > 0),
  routed_to_technician BOOLEAN NOT NULL DEFAULT FALSE, -- DEC-04
  forwarded_by  BIGINT REFERENCES users(id),           -- final review: PM forwards to mujiz
  forwarded_at  TIMESTAMPTZ,
  current_decision mujiz_decision,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notes_session_idx ON notes(session_id);
CREATE INDEX notes_round_idx ON notes(round_id);

-- DEC-05: full decision history (who, when, what)
CREATE TABLE note_decisions (
  id          BIGSERIAL PRIMARY KEY,
  note_id     BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  decision    mujiz_decision NOT NULL,
  comment     TEXT,
  decided_by  BIGINT NOT NULL REFERENCES users(id),
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_decisions_note_idx ON note_decisions(note_id);

CREATE TABLE corrections (
  id           BIGSERIAL PRIMARY KEY,
  note_id      BIGINT NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
  session_id   BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status       correction_status NOT NULL DEFAULT 'open',
  is_rerecord  BOOLEAN NOT NULL DEFAULT FALSE,
  surah        SMALLINT NOT NULL REFERENCES surahs(number),
  ayah_from    SMALLINT NOT NULL,
  ayah_to      SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_by      BIGINT REFERENCES users(id),
  done_at      TIMESTAMPTZ,
  done_version_id BIGINT REFERENCES versions(id),
  verified_by  BIGINT REFERENCES users(id),
  verified_at  TIMESTAMPTZ,
  CHECK (ayah_from <= ayah_to)
);
CREATE INDEX corrections_session_status ON corrections(session_id, status);

-- REV-05: general notes on the reader with scholarly references
CREATE TABLE general_notes (
  id          BIGSERIAL PRIMARY KEY,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id   BIGINT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (length(trim(body)) > 0),
  references_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Attendance & excuses (ATT-01..07)
-- ---------------------------------------------------------------------
CREATE TABLE recording_sittings (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sitting_date DATE NOT NULL,
  outcome      sitting_outcome,
  outcome_note TEXT,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);
CREATE INDEX recording_sittings_project_idx ON recording_sittings(project_id, sitting_date);
-- only one open sitting per project
CREATE UNIQUE INDEX recording_sittings_one_open ON recording_sittings(project_id) WHERE closed_at IS NULL;

CREATE TABLE checkins (
  id           BIGSERIAL PRIMARY KEY,
  sitting_id   BIGINT NOT NULL REFERENCES recording_sittings(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL CHECK (role IN ('reader', 'mujiz', 'technician')),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sitting_id, role)
);

CREATE TABLE sitting_sessions (
  sitting_id  BIGINT NOT NULL REFERENCES recording_sittings(id) ON DELETE CASCADE,
  session_id  BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (sitting_id, session_id)
);

CREATE TABLE excuses (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  reason       TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  is_late      BOOLEAN NOT NULL DEFAULT FALSE,    -- BR-05
  status       excuse_status NOT NULL DEFAULT 'accepted',
  status_by    BIGINT REFERENCES users(id),
  status_at    TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_from <= date_to)
);
CREATE INDEX excuses_project_idx ON excuses(project_id, date_from);
CREATE INDEX excuses_user_idx ON excuses(user_id);

-- ---------------------------------------------------------------------
-- Recording quality & mixing (MIX-01..04)
-- ---------------------------------------------------------------------
CREATE TABLE quality_ratings (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id   BIGINT REFERENCES sessions(id) ON DELETE CASCADE,  -- NULL until a session is available
  version_id   BIGINT REFERENCES versions(id),
  kind         quality_kind NOT NULL,
  requested_by BIGINT REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verdict      quality_verdict,
  notes        TEXT,
  rated_by     BIGINT REFERENCES users(id),
  rated_at     TIMESTAMPTZ,
  CHECK (verdict IS NULL OR verdict = 'approved' OR (notes IS NOT NULL AND length(trim(notes)) > 0))
);
CREATE INDEX quality_ratings_project_idx ON quality_ratings(project_id);

-- ---------------------------------------------------------------------
-- Timers & escalation (TMR-01..05). Each row = one stage of work with the
-- allowed time that was in force when it started (TMR-05).
-- alert_level: 0 none, 1 orange (worker), 2 red (worker; PM orange), 3 PM red (supervisor notified)
-- ---------------------------------------------------------------------
CREATE TABLE stage_timers (
  id            BIGSERIAL PRIMARY KEY,
  project_id    BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id    BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
  round_id      BIGINT REFERENCES review_rounds(id) ON DELETE CASCADE,
  quality_rating_id BIGINT REFERENCES quality_ratings(id) ON DELETE CASCADE,
  stage         timer_stage NOT NULL,
  assignee_id   BIGINT REFERENCES users(id),
  allowed_hours NUMERIC(8,2) NOT NULL,
  orange_grace_hours NUMERIC(8,2) NOT NULL,
  pm_grace_hours NUMERIC(8,2) NOT NULL,
  day_counting  TEXT NOT NULL DEFAULT 'calendar',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at        TIMESTAMPTZ NOT NULL,
  red_at        TIMESTAMPTZ NOT NULL,
  pm_red_at     TIMESTAMPTZ NOT NULL,
  alert_level   SMALLINT NOT NULL DEFAULT 0 CHECK (alert_level BETWEEN 0 AND 3),
  completed_at  TIMESTAMPTZ,
  completed_on_time BOOLEAN
);
CREATE INDEX stage_timers_open_idx ON stage_timers(due_at) WHERE completed_at IS NULL;
CREATE INDEX stage_timers_session_idx ON stage_timers(session_id);
CREATE INDEX stage_timers_project_idx ON stage_timers(project_id);

-- TMR-04: every transition timestamped from actions
CREATE TABLE session_events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_stage  session_stage,
  to_stage    session_stage NOT NULL,
  action      TEXT NOT NULL,
  actor_id    BIGINT REFERENCES users(id),
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX session_events_session_idx ON session_events(session_id, created_at);

-- ---------------------------------------------------------------------
-- Distribution log (DST-01, light phase 2)
-- ---------------------------------------------------------------------
CREATE TABLE distributions (
  id           BIGSERIAL PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient    TEXT NOT NULL CHECK (length(trim(recipient)) > 0),
  channel      TEXT NOT NULL CHECK (channel IN ('netia', 'satellite', 'direct', 'portal', 'other')),
  country      TEXT,
  city         TEXT,
  output_version TEXT,            -- e.g. by hizb / by surah
  delivered_on DATE NOT NULL,
  notes        TEXT,
  feedback     TEXT,             -- step 11: feedback
  created_by   BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX distributions_project_idx ON distributions(project_id);

-- ---------------------------------------------------------------------
-- Notifications (PRJ-05, ADM-04) & audit (ADM-03)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,            -- translated on the client, e.g. 'team_assigned'
  params      JSONB NOT NULL DEFAULT '{}', -- values interpolated into the message
  link        TEXT,
  project_id  BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);
