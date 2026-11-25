-- =====================================================================
-- Mushafs - consolidated schema snapshot (generated with pg_dump --schema-only).
-- Reference only: the source of truth is database/migrations/*.sql,
-- applied with 'npm run db:migrate'. Reference data (surahs, ahzab, note types,
-- templates, settings) is inserted by migrations 002 and 003.
-- =====================================================================


-- Name: public; Type: SCHEMA; Schema: -; Owner: -

-- *not* creating schema, since initdb creates it

-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -

COMMENT ON SCHEMA public IS '';

-- Name: citext; Type: EXTENSION; Schema: -; Owner: -

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';

-- Name: correction_status; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.correction_status AS ENUM (
    'open',
    'done',
    'verified'
);

-- Name: excuse_status; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.excuse_status AS ENUM (
    'accepted',
    'rejected'
);

-- Name: light_status; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.light_status AS ENUM (
    'pending',
    'ready',
    'failed',
    'not_needed'
);

-- Name: mujiz_decision; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.mujiz_decision AS ENUM (
    'accept',
    'reject',
    'studio',
    'technician'
);

-- Name: project_status; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.project_status AS ENUM (
    'pending_approval',
    'approved',
    'recording',
    'mixing',
    'final_review',
    'distribution',
    'completed',
    'cancelled'
);

-- Name: project_type; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.project_type AS ENUM (
    'mushaf',
    'hadith',
    'recitation'
);

-- Name: quality_kind; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.quality_kind AS ENUM (
    'first',
    'random'
);

-- Name: quality_verdict; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.quality_verdict AS ENUM (
    'approved',
    'not_suitable'
);

-- Name: round_result; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.round_result AS ENUM (
    'no_notes',
    'notes'
);

-- Name: round_status; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.round_status AS ENUM (
    'open',
    'submitted',
    'cancelled'
);

-- Name: round_type; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.round_type AS ENUM (
    'first',
    'second',
    'technical',
    'extra',
    'final'
);

-- Name: session_stage; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.session_stage AS ENUM (
    'pending',
    'editing',
    'in_review',
    'awaiting_pass',
    'pm_forward',
    'in_decision',
    'in_corrections',
    'ready_for_mixing',
    'mixed',
    'done'
);

-- Name: sitting_outcome; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.sitting_outcome AS ENUM (
    'full',
    'two_sessions',
    'corrections_only',
    'incomplete'
);

-- Name: team_role; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.team_role AS ENUM (
    'mujiz',
    'technician',
    'reviewer1',
    'reviewer2',
    'final_reviewer',
    'mixing_lead'
);

-- Name: timer_stage; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.timer_stage AS ENUM (
    'editing',
    'review',
    'quality_rating',
    'mixing',
    'decision',
    'corrections'
);

-- Name: user_role; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'supervisor',
    'production_manager',
    'mujiz',
    'technician',
    'reader',
    'reviewer',
    'mixing_lead'
);

-- Name: version_kind; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.version_kind AS ENUM (
    'raw',
    'mixed'
);

-- Name: audit_log; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    user_id bigint,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    details jsonb,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

-- Name: checkins; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.checkins (
    id bigint NOT NULL,
    sitting_id bigint NOT NULL,
    user_id bigint NOT NULL,
    role text NOT NULL,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checkins_role_check CHECK ((role = ANY (ARRAY['reader'::text, 'mujiz'::text, 'technician'::text])))
);

-- Name: checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.checkins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.checkins_id_seq OWNED BY public.checkins.id;

-- Name: corrections; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.corrections (
    id bigint NOT NULL,
    note_id bigint NOT NULL,
    session_id bigint NOT NULL,
    status public.correction_status DEFAULT 'open'::public.correction_status NOT NULL,
    is_rerecord boolean DEFAULT false NOT NULL,
    surah smallint NOT NULL,
    ayah_from smallint NOT NULL,
    ayah_to smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    done_by bigint,
    done_at timestamp with time zone,
    done_version_id bigint,
    verified_by bigint,
    verified_at timestamp with time zone,
    CONSTRAINT corrections_check CHECK ((ayah_from <= ayah_to))
);

-- Name: corrections_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.corrections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: corrections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.corrections_id_seq OWNED BY public.corrections.id;

-- Name: distributions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.distributions (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    recipient text NOT NULL,
    channel text NOT NULL,
    country text,
    city text,
    output_version text,
    delivered_on date NOT NULL,
    notes text,
    feedback text,
    created_by bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT distributions_channel_check CHECK ((channel = ANY (ARRAY['netia'::text, 'satellite'::text, 'direct'::text, 'portal'::text, 'other'::text]))),
    CONSTRAINT distributions_recipient_check CHECK ((length(TRIM(BOTH FROM recipient)) > 0))
);

-- Name: distributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.distributions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: distributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.distributions_id_seq OWNED BY public.distributions.id;

-- Name: excuses; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.excuses (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    date_from date NOT NULL,
    date_to date NOT NULL,
    reason text NOT NULL,
    is_late boolean DEFAULT false NOT NULL,
    status public.excuse_status DEFAULT 'accepted'::public.excuse_status NOT NULL,
    status_by bigint,
    status_at timestamp with time zone,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT excuses_check CHECK ((date_from <= date_to)),
    CONSTRAINT excuses_reason_check CHECK ((length(TRIM(BOTH FROM reason)) > 0))
);

-- Name: excuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.excuses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: excuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.excuses_id_seq OWNED BY public.excuses.id;

-- Name: final_review_assignments; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.final_review_assignments (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    reviewer_id bigint NOT NULL,
    session_from smallint NOT NULL,
    session_to smallint NOT NULL,
    split_label text NOT NULL,
    created_by bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT final_review_assignments_check CHECK ((session_from <= session_to))
);

-- Name: final_review_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.final_review_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: final_review_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.final_review_assignments_id_seq OWNED BY public.final_review_assignments.id;

-- Name: general_notes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.general_notes (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    author_id bigint NOT NULL,
    body text NOT NULL,
    references_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT general_notes_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0))
);

-- Name: general_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.general_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: general_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.general_notes_id_seq OWNED BY public.general_notes.id;

-- Name: hizbs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.hizbs (
    number smallint NOT NULL,
    start_surah smallint NOT NULL,
    start_ayah smallint NOT NULL,
    end_surah smallint NOT NULL,
    end_ayah smallint NOT NULL,
    CONSTRAINT hizbs_number_check CHECK (((number >= 1) AND (number <= 60)))
);

-- Name: note_decisions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.note_decisions (
    id bigint NOT NULL,
    note_id bigint NOT NULL,
    decision public.mujiz_decision NOT NULL,
    comment text,
    decided_by bigint NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: note_decisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.note_decisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: note_decisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.note_decisions_id_seq OWNED BY public.note_decisions.id;

-- Name: note_types; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.note_types (
    id integer NOT NULL,
    code text NOT NULL,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    severity smallint DEFAULT 1 NOT NULL,
    is_clear_error boolean DEFAULT false NOT NULL,
    is_technical boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL
);

-- Name: note_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.note_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: note_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.note_types_id_seq OWNED BY public.note_types.id;

-- Name: notes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.notes (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    round_id bigint NOT NULL,
    version_id bigint NOT NULL,
    author_id bigint NOT NULL,
    note_type_id integer NOT NULL,
    surah smallint NOT NULL,
    ayah smallint NOT NULL,
    timestamp_sec numeric(10,2) NOT NULL,
    body text NOT NULL,
    routed_to_technician boolean DEFAULT false NOT NULL,
    forwarded_by bigint,
    forwarded_at timestamp with time zone,
    current_decision public.mujiz_decision,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notes_ayah_check CHECK ((ayah > 0)),
    CONSTRAINT notes_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT notes_timestamp_sec_check CHECK ((timestamp_sec >= (0)::numeric))
);

-- Name: notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.notes_id_seq OWNED BY public.notes.id;

-- Name: notifications; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    kind text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    link text,
    project_id bigint,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

-- Name: project_members; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.project_members (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    user_id bigint NOT NULL,
    team_role public.team_role NOT NULL,
    assigned_by bigint NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_by bigint,
    removed_at timestamp with time zone,
    change_reason text
);

-- Name: project_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.project_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: project_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.project_members_id_seq OWNED BY public.project_members.id;

-- Name: projects; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.projects (
    id bigint NOT NULL,
    title text NOT NULL,
    project_type public.project_type NOT NULL,
    template_id integer NOT NULL,
    riwayah text NOT NULL,
    reader_id bigint NOT NULL,
    status public.project_status DEFAULT 'pending_approval'::public.project_status NOT NULL,
    session_count smallint NOT NULL,
    recording_weekdays smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    sessions_per_day smallint DEFAULT 1 NOT NULL,
    description text,
    created_by bigint NOT NULL,
    approved_by bigint,
    approved_at timestamp with time zone,
    started_at timestamp with time zone,
    recording_completed_at timestamp with time zone,
    mixing_started_at timestamp with time zone,
    final_review_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projects_session_count_check CHECK ((session_count > 0)),
    CONSTRAINT projects_sessions_per_day_check CHECK (((sessions_per_day >= 1) AND (sessions_per_day <= 4))),
    CONSTRAINT projects_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;

-- Name: quality_ratings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.quality_ratings (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    session_id bigint,
    version_id bigint,
    kind public.quality_kind NOT NULL,
    requested_by bigint,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    verdict public.quality_verdict,
    notes text,
    rated_by bigint,
    rated_at timestamp with time zone,
    CONSTRAINT quality_ratings_check CHECK (((verdict IS NULL) OR (verdict = 'approved'::public.quality_verdict) OR ((notes IS NOT NULL) AND (length(TRIM(BOTH FROM notes)) > 0))))
);

-- Name: quality_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.quality_ratings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: quality_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.quality_ratings_id_seq OWNED BY public.quality_ratings.id;

-- Name: recording_sittings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.recording_sittings (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    sitting_date date NOT NULL,
    outcome public.sitting_outcome,
    outcome_note text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);

-- Name: recording_sittings_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.recording_sittings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: recording_sittings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.recording_sittings_id_seq OWNED BY public.recording_sittings.id;

-- Name: review_rounds; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.review_rounds (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    version_id bigint NOT NULL,
    round_type public.round_type NOT NULL,
    round_no smallint NOT NULL,
    reviewer_id bigint NOT NULL,
    status public.round_status DEFAULT 'open'::public.round_status NOT NULL,
    result public.round_result,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    first_opened_at timestamp with time zone,
    submitted_at timestamp with time zone,
    final_assignment_id bigint
);

-- Name: review_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.review_rounds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: review_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.review_rounds_id_seq OWNED BY public.review_rounds.id;

-- Name: session_events; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.session_events (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    from_stage public.session_stage,
    to_stage public.session_stage NOT NULL,
    action text NOT NULL,
    actor_id bigint,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: session_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.session_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: session_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.session_events_id_seq OWNED BY public.session_events.id;

-- Name: sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sessions (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    number smallint NOT NULL,
    title text,
    start_surah smallint,
    start_ayah smallint,
    end_surah smallint,
    end_ayah smallint,
    stage public.session_stage DEFAULT 'pending'::public.session_stage NOT NULL,
    stage_entered_at timestamp with time zone DEFAULT now() NOT NULL,
    current_round_id bigint,
    next_round_index smallint DEFAULT 0 NOT NULL,
    recorded_at timestamp with time zone,
    ready_for_mixing_at timestamp with time zone,
    mixed_at timestamp with time zone,
    done_at timestamp with time zone,
    CONSTRAINT sessions_number_check CHECK ((number > 0))
);

-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;

-- Name: settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: sitting_sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.sitting_sessions (
    sitting_id bigint NOT NULL,
    session_id bigint NOT NULL
);

-- Name: stage_timers; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.stage_timers (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    session_id bigint,
    round_id bigint,
    quality_rating_id bigint,
    stage public.timer_stage NOT NULL,
    assignee_id bigint,
    allowed_hours numeric(8,2) NOT NULL,
    orange_grace_hours numeric(8,2) NOT NULL,
    pm_grace_hours numeric(8,2) NOT NULL,
    day_counting text DEFAULT 'calendar'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone NOT NULL,
    red_at timestamp with time zone NOT NULL,
    pm_red_at timestamp with time zone NOT NULL,
    alert_level smallint DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    completed_on_time boolean,
    CONSTRAINT stage_timers_alert_level_check CHECK (((alert_level >= 0) AND (alert_level <= 3)))
);

-- Name: stage_timers_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.stage_timers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: stage_timers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.stage_timers_id_seq OWNED BY public.stage_timers.id;

-- Name: surahs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.surahs (
    number smallint NOT NULL,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    ayah_count smallint NOT NULL,
    CONSTRAINT surahs_ayah_count_check CHECK ((ayah_count > 0)),
    CONSTRAINT surahs_number_check CHECK (((number >= 1) AND (number <= 114)))
);

-- Name: templates; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.templates (
    id integer NOT NULL,
    code text NOT NULL,
    project_type public.project_type NOT NULL,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    fixed_session_count smallint,
    uses_hizb_ranges boolean DEFAULT false NOT NULL,
    review_rounds public.round_type[] DEFAULT ARRAY['first'::public.round_type, 'second'::public.round_type, 'technical'::public.round_type] NOT NULL
);

-- Name: templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.templates_id_seq OWNED BY public.templates.id;

-- Name: user_private_data; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.user_private_data (
    user_id bigint NOT NULL,
    national_id_enc text,
    iban_enc text,
    id_document_path text,
    id_document_name text,
    id_document_mime text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id bigint NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    phone text,
    roles public.user_role[] NOT NULL,
    locale text DEFAULT 'ar'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_full_name_check CHECK ((length(TRIM(BOTH FROM full_name)) > 0)),
    CONSTRAINT users_locale_check CHECK ((locale = ANY (ARRAY['ar'::text, 'en'::text]))),
    CONSTRAINT users_roles_check CHECK ((cardinality(roles) > 0))
);

-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

-- Name: versions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.versions (
    id bigint NOT NULL,
    session_id bigint NOT NULL,
    kind public.version_kind NOT NULL,
    version_no integer NOT NULL,
    file_path text NOT NULL,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    duration_sec numeric(10,2),
    light_path text,
    light_status public.light_status DEFAULT 'pending'::public.light_status NOT NULL,
    is_approved boolean DEFAULT false NOT NULL,
    upload_reason text,
    uploaded_by bigint NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -

CREATE SEQUENCE public.versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -

ALTER SEQUENCE public.versions_id_seq OWNED BY public.versions.id;

-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);

-- Name: checkins id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.checkins ALTER COLUMN id SET DEFAULT nextval('public.checkins_id_seq'::regclass);

-- Name: corrections id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections ALTER COLUMN id SET DEFAULT nextval('public.corrections_id_seq'::regclass);

-- Name: distributions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.distributions ALTER COLUMN id SET DEFAULT nextval('public.distributions_id_seq'::regclass);

-- Name: excuses id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.excuses ALTER COLUMN id SET DEFAULT nextval('public.excuses_id_seq'::regclass);

-- Name: final_review_assignments id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.final_review_assignments ALTER COLUMN id SET DEFAULT nextval('public.final_review_assignments_id_seq'::regclass);

-- Name: general_notes id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.general_notes ALTER COLUMN id SET DEFAULT nextval('public.general_notes_id_seq'::regclass);

-- Name: note_decisions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_decisions ALTER COLUMN id SET DEFAULT nextval('public.note_decisions_id_seq'::regclass);

-- Name: note_types id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_types ALTER COLUMN id SET DEFAULT nextval('public.note_types_id_seq'::regclass);

-- Name: notes id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes ALTER COLUMN id SET DEFAULT nextval('public.notes_id_seq'::regclass);

-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);

-- Name: project_members id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members ALTER COLUMN id SET DEFAULT nextval('public.project_members_id_seq'::regclass);

-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);

-- Name: quality_ratings id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings ALTER COLUMN id SET DEFAULT nextval('public.quality_ratings_id_seq'::regclass);

-- Name: recording_sittings id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.recording_sittings ALTER COLUMN id SET DEFAULT nextval('public.recording_sittings_id_seq'::regclass);

-- Name: review_rounds id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds ALTER COLUMN id SET DEFAULT nextval('public.review_rounds_id_seq'::regclass);

-- Name: session_events id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.session_events ALTER COLUMN id SET DEFAULT nextval('public.session_events_id_seq'::regclass);

-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);

-- Name: stage_timers id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers ALTER COLUMN id SET DEFAULT nextval('public.stage_timers_id_seq'::regclass);

-- Name: templates id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.templates ALTER COLUMN id SET DEFAULT nextval('public.templates_id_seq'::regclass);

-- Name: users id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

-- Name: versions id; Type: DEFAULT; Schema: public; Owner: -

ALTER TABLE ONLY public.versions ALTER COLUMN id SET DEFAULT nextval('public.versions_id_seq'::regclass);

-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

-- Name: checkins checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_pkey PRIMARY KEY (id);

-- Name: checkins checkins_sitting_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_sitting_id_role_key UNIQUE (sitting_id, role);

-- Name: corrections corrections_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_note_id_key UNIQUE (note_id);

-- Name: corrections corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_pkey PRIMARY KEY (id);

-- Name: distributions distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_pkey PRIMARY KEY (id);

-- Name: excuses excuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.excuses
    ADD CONSTRAINT excuses_pkey PRIMARY KEY (id);

-- Name: final_review_assignments final_review_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.final_review_assignments
    ADD CONSTRAINT final_review_assignments_pkey PRIMARY KEY (id);

-- Name: general_notes general_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.general_notes
    ADD CONSTRAINT general_notes_pkey PRIMARY KEY (id);

-- Name: hizbs hizbs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.hizbs
    ADD CONSTRAINT hizbs_pkey PRIMARY KEY (number);

-- Name: note_decisions note_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_decisions
    ADD CONSTRAINT note_decisions_pkey PRIMARY KEY (id);

-- Name: note_types note_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_types
    ADD CONSTRAINT note_types_code_key UNIQUE (code);

-- Name: note_types note_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_types
    ADD CONSTRAINT note_types_pkey PRIMARY KEY (id);

-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);

-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

-- Name: quality_ratings quality_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_pkey PRIMARY KEY (id);

-- Name: recording_sittings recording_sittings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.recording_sittings
    ADD CONSTRAINT recording_sittings_pkey PRIMARY KEY (id);

-- Name: review_rounds review_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_pkey PRIMARY KEY (id);

-- Name: review_rounds review_rounds_session_id_round_no_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_session_id_round_no_key UNIQUE (session_id, round_no);

-- Name: session_events session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_pkey PRIMARY KEY (id);

-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

-- Name: sessions sessions_project_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_project_id_number_key UNIQUE (project_id, number);

-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);

-- Name: sitting_sessions sitting_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sitting_sessions
    ADD CONSTRAINT sitting_sessions_pkey PRIMARY KEY (sitting_id, session_id);

-- Name: stage_timers stage_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_pkey PRIMARY KEY (id);

-- Name: surahs surahs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.surahs
    ADD CONSTRAINT surahs_pkey PRIMARY KEY (number);

-- Name: templates templates_code_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_code_key UNIQUE (code);

-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

-- Name: user_private_data user_private_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_private_data
    ADD CONSTRAINT user_private_data_pkey PRIMARY KEY (user_id);

-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: versions versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.versions
    ADD CONSTRAINT versions_pkey PRIMARY KEY (id);

-- Name: versions versions_session_id_kind_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.versions
    ADD CONSTRAINT versions_session_id_kind_version_no_key UNIQUE (session_id, kind, version_no);

-- Name: audit_log_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);

-- Name: audit_log_entity_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity, entity_id);

-- Name: corrections_session_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX corrections_session_status ON public.corrections USING btree (session_id, status);

-- Name: distributions_project_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX distributions_project_idx ON public.distributions USING btree (project_id);

-- Name: excuses_project_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX excuses_project_idx ON public.excuses USING btree (project_id, date_from);

-- Name: excuses_user_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX excuses_user_idx ON public.excuses USING btree (user_id);

-- Name: note_decisions_note_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX note_decisions_note_idx ON public.note_decisions USING btree (note_id);

-- Name: notes_round_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notes_round_idx ON public.notes USING btree (round_id);

-- Name: notes_session_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notes_session_idx ON public.notes USING btree (session_id);

-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);

-- Name: notifications_user_unread; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notifications_user_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);

-- Name: project_members_no_dupe_final; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX project_members_no_dupe_final ON public.project_members USING btree (project_id, user_id, team_role) WHERE (removed_at IS NULL);

-- Name: project_members_one_active_seat; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX project_members_one_active_seat ON public.project_members USING btree (project_id, team_role) WHERE ((removed_at IS NULL) AND (team_role <> 'final_reviewer'::public.team_role));

-- Name: project_members_user_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX project_members_user_idx ON public.project_members USING btree (user_id) WHERE (removed_at IS NULL);

-- Name: projects_reader_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX projects_reader_idx ON public.projects USING btree (reader_id);

-- Name: projects_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX projects_status_idx ON public.projects USING btree (status);

-- Name: quality_ratings_project_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX quality_ratings_project_idx ON public.quality_ratings USING btree (project_id);

-- Name: recording_sittings_one_open; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX recording_sittings_one_open ON public.recording_sittings USING btree (project_id) WHERE (closed_at IS NULL);

-- Name: recording_sittings_project_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX recording_sittings_project_idx ON public.recording_sittings USING btree (project_id, sitting_date);

-- Name: review_rounds_reviewer_open; Type: INDEX; Schema: public; Owner: -

CREATE INDEX review_rounds_reviewer_open ON public.review_rounds USING btree (reviewer_id) WHERE (status = 'open'::public.round_status);

-- Name: session_events_session_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX session_events_session_idx ON public.session_events USING btree (session_id, created_at);

-- Name: sessions_project_stage_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX sessions_project_stage_idx ON public.sessions USING btree (project_id, stage);

-- Name: stage_timers_open_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX stage_timers_open_idx ON public.stage_timers USING btree (due_at) WHERE (completed_at IS NULL);

-- Name: stage_timers_project_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX stage_timers_project_idx ON public.stage_timers USING btree (project_id);

-- Name: stage_timers_session_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX stage_timers_session_idx ON public.stage_timers USING btree (session_id);

-- Name: users_roles_gin; Type: INDEX; Schema: public; Owner: -

CREATE INDEX users_roles_gin ON public.users USING gin (roles);

-- Name: versions_one_approved; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX versions_one_approved ON public.versions USING btree (session_id, kind) WHERE is_approved;

-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Name: checkins checkins_sitting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_sitting_id_fkey FOREIGN KEY (sitting_id) REFERENCES public.recording_sittings(id) ON DELETE CASCADE;

-- Name: checkins checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.checkins
    ADD CONSTRAINT checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Name: corrections corrections_done_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_done_by_fkey FOREIGN KEY (done_by) REFERENCES public.users(id);

-- Name: corrections corrections_done_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_done_version_id_fkey FOREIGN KEY (done_version_id) REFERENCES public.versions(id);

-- Name: corrections corrections_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

-- Name: corrections corrections_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: corrections corrections_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_surah_fkey FOREIGN KEY (surah) REFERENCES public.surahs(number);

-- Name: corrections corrections_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.corrections
    ADD CONSTRAINT corrections_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);

-- Name: distributions distributions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Name: distributions distributions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: excuses excuses_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.excuses
    ADD CONSTRAINT excuses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: excuses excuses_status_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.excuses
    ADD CONSTRAINT excuses_status_by_fkey FOREIGN KEY (status_by) REFERENCES public.users(id);

-- Name: excuses excuses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.excuses
    ADD CONSTRAINT excuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Name: final_review_assignments final_review_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.final_review_assignments
    ADD CONSTRAINT final_review_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Name: final_review_assignments final_review_assignments_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.final_review_assignments
    ADD CONSTRAINT final_review_assignments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: final_review_assignments final_review_assignments_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.final_review_assignments
    ADD CONSTRAINT final_review_assignments_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);

-- Name: general_notes general_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.general_notes
    ADD CONSTRAINT general_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);

-- Name: general_notes general_notes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.general_notes
    ADD CONSTRAINT general_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: hizbs hizbs_end_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.hizbs
    ADD CONSTRAINT hizbs_end_surah_fkey FOREIGN KEY (end_surah) REFERENCES public.surahs(number);

-- Name: hizbs hizbs_start_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.hizbs
    ADD CONSTRAINT hizbs_start_surah_fkey FOREIGN KEY (start_surah) REFERENCES public.surahs(number);

-- Name: note_decisions note_decisions_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_decisions
    ADD CONSTRAINT note_decisions_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);

-- Name: note_decisions note_decisions_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.note_decisions
    ADD CONSTRAINT note_decisions_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

-- Name: notes notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);

-- Name: notes notes_forwarded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_forwarded_by_fkey FOREIGN KEY (forwarded_by) REFERENCES public.users(id);

-- Name: notes notes_note_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_note_type_id_fkey FOREIGN KEY (note_type_id) REFERENCES public.note_types(id);

-- Name: notes notes_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.review_rounds(id) ON DELETE CASCADE;

-- Name: notes notes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: notes notes_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_surah_fkey FOREIGN KEY (surah) REFERENCES public.surahs(number);

-- Name: notes notes_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.versions(id);

-- Name: notifications notifications_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: project_members project_members_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);

-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: project_members project_members_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.users(id);

-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

-- Name: projects projects_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);

-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

-- Name: projects projects_reader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_reader_id_fkey FOREIGN KEY (reader_id) REFERENCES public.users(id);

-- Name: projects projects_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id);

-- Name: quality_ratings quality_ratings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: quality_ratings quality_ratings_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id);

-- Name: quality_ratings quality_ratings_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

-- Name: quality_ratings quality_ratings_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: quality_ratings quality_ratings_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.quality_ratings
    ADD CONSTRAINT quality_ratings_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.versions(id);

-- Name: recording_sittings recording_sittings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.recording_sittings
    ADD CONSTRAINT recording_sittings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: review_rounds review_rounds_final_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_final_assignment_id_fkey FOREIGN KEY (final_assignment_id) REFERENCES public.final_review_assignments(id);

-- Name: review_rounds review_rounds_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);

-- Name: review_rounds review_rounds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: review_rounds review_rounds_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.review_rounds
    ADD CONSTRAINT review_rounds_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.versions(id);

-- Name: session_events session_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);

-- Name: session_events session_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: sessions sessions_current_round_fk; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_current_round_fk FOREIGN KEY (current_round_id) REFERENCES public.review_rounds(id) ON DELETE SET NULL;

-- Name: sessions sessions_end_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_end_surah_fkey FOREIGN KEY (end_surah) REFERENCES public.surahs(number);

-- Name: sessions sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: sessions sessions_start_surah_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_start_surah_fkey FOREIGN KEY (start_surah) REFERENCES public.surahs(number);

-- Name: settings settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);

-- Name: sitting_sessions sitting_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sitting_sessions
    ADD CONSTRAINT sitting_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: sitting_sessions sitting_sessions_sitting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.sitting_sessions
    ADD CONSTRAINT sitting_sessions_sitting_id_fkey FOREIGN KEY (sitting_id) REFERENCES public.recording_sittings(id) ON DELETE CASCADE;

-- Name: stage_timers stage_timers_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);

-- Name: stage_timers stage_timers_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- Name: stage_timers stage_timers_quality_rating_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_quality_rating_id_fkey FOREIGN KEY (quality_rating_id) REFERENCES public.quality_ratings(id) ON DELETE CASCADE;

-- Name: stage_timers stage_timers_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.review_rounds(id) ON DELETE CASCADE;

-- Name: stage_timers stage_timers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.stage_timers
    ADD CONSTRAINT stage_timers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: user_private_data user_private_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.user_private_data
    ADD CONSTRAINT user_private_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: versions versions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.versions
    ADD CONSTRAINT versions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

-- Name: versions versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.versions
    ADD CONSTRAINT versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

