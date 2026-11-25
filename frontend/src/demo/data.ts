/**
 * Demo dataset (fictional people and projects). Used only when the app is built with
 * `npm run build:demo`, so the static demo can be shared without a server or database.
 * Quran reference data (114 surahs, 60 ahzab) is a copy of database/migrations/002_reference_data.sql
 * kept inside the frontend folder, so the demo builds from `frontend/` alone.
 */
import quran from './quran.json';

// ------------------------------------------------------------------ reference data
export interface Surah { number: number; name_ar: string; name_en: string; ayah_count: number }
export interface Hizb { number: number; start_surah: number; start_ayah: number; end_surah: number; end_ayah: number }

export const surahs: Surah[] = quran.surahs;
export const hizbs: Hizb[] = quran.hizbs;

// ------------------------------------------------------------------ time helpers
const HOUR = 3_600_000;
const NOW = Date.now();
export const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
export const ahead = (hours: number) => new Date(NOW + hours * HOUR).toISOString();
export const dateAgo = (days: number) => new Date(NOW - days * 24 * HOUR).toISOString().slice(0, 10);

// ------------------------------------------------------------------ people (fictional)
export type Role = 'admin' | 'supervisor' | 'production_manager' | 'mujiz' | 'technician' | 'reader' | 'reviewer' | 'mixing_lead';
export interface DemoUser { id: number; email: string; full_name: string; roles: Role[]; phone: string | null; locale: 'ar'; is_active: boolean; last_login_at: string; created_at: string }

const u = (id: number, full_name: string, roles: Role[], email: string): DemoUser => ({
  id, full_name, roles, email: `${email}@demo.mushafs`, phone: null, locale: 'ar', is_active: true, last_login_at: ago(id * 3), created_at: ago(24 * 200),
});

export const users: DemoUser[] = [
  u(1, 'أ. عبدالله الراشد', ['admin'], 'admin'),
  u(2, 'د. سلمان الحربي', ['supervisor'], 'supervisor'),
  u(3, 'أ. فهد القحطاني', ['production_manager'], 'manager'),
  u(4, 'الشيخ محمد الأنصاري', ['mujiz'], 'mujiz'),
  u(5, 'م. ياسر الدوسري', ['technician'], 'technician'),
  u(6, 'الشيخ عبدالرحمن السالم', ['reader'], 'reader'),
  u(7, 'أ. عمر الشمري', ['reviewer'], 'reviewer1'),
  u(8, 'أ. ماجد الزهراني', ['reviewer'], 'reviewer2'),
  u(9, 'أ. نايف العنزي', ['reviewer'], 'reviewer3'),
  u(10, 'م. سعد المطيري', ['mixing_lead'], 'mixing'),
  u(11, 'الشيخ يوسف البلوشي', ['reader'], 'reader2'),
  u(12, 'الشيخ إبراهيم الغامدي', ['reader'], 'reader3'),
];
export const userById = (id: number) => users.find((x) => x.id === id)!;
export const nameOf = (id: number | null | undefined) => (id ? userById(id)?.full_name ?? '—' : '—');

/** Roles you can switch between in the demo bar (persona = a demo user). */
export const personas: { key: string; userId: number }[] = [
  { key: 'production_manager', userId: 3 },
  { key: 'admin', userId: 1 },
  { key: 'supervisor', userId: 2 },
  { key: 'mujiz', userId: 4 },
  { key: 'technician', userId: 5 },
  { key: 'reader', userId: 6 },
  { key: 'reviewer', userId: 7 },
  { key: 'mixing_lead', userId: 10 },
];

// ------------------------------------------------------------------ note types & settings
export const noteTypes = [
  { id: 1, code: 'lahn_jali', name_ar: 'لحن جلي', name_en: 'Clear error (lahn jali)', severity: 5, is_clear_error: true, is_technical: false, is_active: true, sort_order: 1 },
  { id: 2, code: 'tajweed', name_ar: 'تجويد', name_en: 'Tajweed', severity: 3, is_clear_error: false, is_technical: false, is_active: true, sort_order: 2 },
  { id: 3, code: 'waqf_ibtida', name_ar: 'وقف وابتداء', name_en: 'Stopping / starting', severity: 3, is_clear_error: false, is_technical: false, is_active: true, sort_order: 3 },
  { id: 4, code: 'performance', name_ar: 'أداء', name_en: 'Performance', severity: 2, is_clear_error: false, is_technical: false, is_active: true, sort_order: 4 },
  { id: 5, code: 'technical', name_ar: 'فني', name_en: 'Technical', severity: 2, is_clear_error: false, is_technical: true, is_active: true, sort_order: 5 },
];

export const settings = {
  editing_hours: 48, review_hours: 48, decision_hours: 24, corrections_hours: 48, quality_rating_hours: 48, mixing_hours: 336,
  orange_grace_hours: 48, pm_grace_hours: 48, excuse_cutoff: { mode: 'hours', hours: 20, time: '22:00' },
  auto_pass_no_notes: false, technical_notes_to_technician: true, day_counting: 'calendar', weekend_days: [5, 6], random_quality_after_session: 20,
};

export const templates = [
  { id: 1, code: 'mushaf', project_type: 'mushaf', name_ar: 'مصحف مرتل (60 حزبًا)', name_en: 'Recited mushaf (60 ahzab)', fixed_session_count: 60, uses_hizb_ranges: true, review_rounds: ['first', 'second', 'technical'] },
  { id: 2, code: 'hadith', project_type: 'hadith', name_ar: 'سلسلة أحاديث', name_en: 'Hadith series', fixed_session_count: null, uses_hizb_ranges: false, review_rounds: ['first', 'second', 'technical'] },
  { id: 3, code: 'recitation', project_type: 'recitation', name_ar: 'تلاوات متفرقة', name_en: 'Scattered recitations', fixed_session_count: null, uses_hizb_ranges: false, review_rounds: ['first', 'second', 'technical'] },
];

// ------------------------------------------------------------------ projects
export interface DemoProject {
  id: number; title: string; project_type: 'mushaf' | 'hadith' | 'recitation'; template_id: number; riwayah: string;
  reader_id: number; status: string; session_count: number; recording_weekdays: number[]; sessions_per_day: number; description: string | null;
  approved_at: string | null; started_at: string | null; recording_completed_at: string | null; mixing_started_at: string | null;
  final_review_started_at: string | null; completed_at: string | null; created_at: string;
  team: { team_role: string; user_id: number }[];
}

const coreTeam = [
  { team_role: 'mujiz', user_id: 4 }, { team_role: 'technician', user_id: 5 }, { team_role: 'reviewer1', user_id: 7 },
  { team_role: 'reviewer2', user_id: 8 }, { team_role: 'mixing_lead', user_id: 10 },
];

export const projects: DemoProject[] = [
  {
    id: 1, title: 'مصحف الشيخ عبدالرحمن السالم', project_type: 'mushaf', template_id: 1, riwayah: 'حفص عن عاصم', reader_id: 6,
    status: 'recording', session_count: 60, recording_weekdays: [0, 1, 2, 3], sessions_per_day: 1,
    description: 'تسجيل المصحف كاملًا برواية حفص، بعد الفجر في استوديو المركز.',
    approved_at: ago(24 * 70), started_at: ago(24 * 66), recording_completed_at: null, mixing_started_at: null, final_review_started_at: null,
    completed_at: null, created_at: ago(24 * 75), team: coreTeam,
  },
  {
    id: 2, title: 'مصحف الشيخ يوسف البلوشي', project_type: 'mushaf', template_id: 1, riwayah: 'ورش عن نافع', reader_id: 11,
    status: 'final_review', session_count: 60, recording_weekdays: [0, 2, 4], sessions_per_day: 2, description: null,
    approved_at: ago(24 * 190), started_at: ago(24 * 180), recording_completed_at: ago(24 * 60), mixing_started_at: ago(24 * 40),
    final_review_started_at: ago(24 * 12), completed_at: null, created_at: ago(24 * 195),
    team: [...coreTeam, { team_role: 'final_reviewer', user_id: 9 }, { team_role: 'final_reviewer', user_id: 8 }],
  },
  {
    id: 3, title: 'الأربعون النووية', project_type: 'hadith', template_id: 2, riwayah: 'إلقاء', reader_id: 12,
    status: 'completed', session_count: 42, recording_weekdays: [1, 3], sessions_per_day: 2, description: 'سلسلة الأربعين النووية مع زيادات ابن رجب.',
    approved_at: ago(24 * 300), started_at: ago(24 * 290), recording_completed_at: ago(24 * 220), mixing_started_at: ago(24 * 200),
    final_review_started_at: ago(24 * 180), completed_at: ago(24 * 150), created_at: ago(24 * 305), team: coreTeam,
  },
  {
    id: 4, title: 'مصحف برواية قالون', project_type: 'mushaf', template_id: 1, riwayah: 'قالون عن نافع', reader_id: 12,
    status: 'pending_approval', session_count: 60, recording_weekdays: [0, 1, 2, 3, 4], sessions_per_day: 1, description: 'بانتظار اعتماد إدارة المركز.',
    approved_at: null, started_at: null, recording_completed_at: null, mixing_started_at: null, final_review_started_at: null,
    completed_at: null, created_at: ago(30), team: [],
  },
];
export const projectById = (id: number) => projects.find((p) => p.id === id);

// ------------------------------------------------------------------ sessions
export interface DemoSession {
  id: number; project_id: number; number: number; title: string | null; stage: string;
  start_surah: number | null; start_ayah: number | null; end_surah: number | null; end_ayah: number | null;
  round: 'first' | 'second' | 'technical' | 'final' | null; alert: number; unread: boolean; enteredHoursAgo: number;
}

function stageFor(projectId: number, n: number): Pick<DemoSession, 'stage' | 'round' | 'alert' | 'unread' | 'enteredHoursAgo'> {
  const s = (stage: string, round: DemoSession['round'] = null, alert = 0, unread = false, enteredHoursAgo = 24) => ({ stage, round, alert, unread, enteredHoursAgo });
  if (projectId === 1) {
    if (n <= 22) return s('ready_for_mixing', null, 0, false, 24 * (40 - n));
    if (n <= 25) return s('in_review', 'second', n === 23 ? 1 : 0, false, n === 23 ? 60 : 20);
    if (n === 26) return s('in_review', 'technical', 0, false, 10);
    if (n === 27) return s('in_decision', null, 1, false, 30);
    if (n === 28) return s('in_corrections', null, 0, false, 18);
    if (n === 29) return s('awaiting_pass', null, 0, false, 6);
    if (n === 30) return s('in_review', 'first', 2, false, 110);
    if (n === 31) return s('in_review', 'first', 0, true, 26);
    if (n === 32) return s('editing', null, 0, false, 4);
    return s('pending');
  }
  if (projectId === 2) {
    if (n <= 38) return s('done', null, 0, false, 24 * 3);
    if (n <= 48) return s('in_review', 'final', n === 41 ? 1 : 0, n > 45, 24 * 5);
    if (n === 49) return s('pm_forward', null, 0, false, 20);
    if (n === 50) return s('in_corrections', null, 0, false, 40);
    return s('in_review', 'final', 0, true, 24 * 4);
  }
  return s('done', null, 0, false, 24 * 160);
}

function buildSessions(): DemoSession[] {
  const out: DemoSession[] = [];
  for (const p of projects) {
    if (p.status === 'pending_approval') continue;
    for (let n = 1; n <= p.session_count; n++) {
      const h = p.project_type === 'mushaf' ? hizbs[n - 1] : null;
      out.push({
        id: p.id * 1000 + n, project_id: p.id, number: n, title: h ? null : `الحديث ${n}`,
        start_surah: h?.start_surah ?? null, start_ayah: h?.start_ayah ?? null, end_surah: h?.end_surah ?? null, end_ayah: h?.end_ayah ?? null,
        ...stageFor(p.id, n),
      });
    }
  }
  return out;
}
export const sessions = buildSessions();
export const sessionsOf = (projectId: number) => sessions.filter((s) => s.project_id === projectId);
export const sessionById = (id: number) => sessions.find((s) => s.id === id);

/** Which person reviews a round on a project. */
export function reviewerFor(_p: DemoProject, s: DemoSession, round: string) {
  if (round === 'first') return 7;
  if (round === 'second') return 8;
  if (round === 'technical') return 5;
  return s.number <= 30 ? 9 : 8; // final review split: halves
}

// ------------------------------------------------------------------ notifications & audit
export const notificationsFor = (userId: number) => {
  const base = [
    { kind: 'review_assigned', params: { session: 31, round: 'first' }, link: '/sessions/1031', h: 26 },
    { kind: 'notes_awaiting_decision', params: { session: 27, count: 3 }, link: '/sessions/1027', h: 30 },
    { kind: 'corrections_required', params: { session: 28, count: 2 }, link: '/sessions/1028', h: 18 },
    { kind: 'timer_orange', params: { stage: 'review', project: projects[0].title, session: 23 }, link: '/sessions/1023', h: 12 },
    { kind: 'escalation_pm_orange', params: { stage: 'review', project: projects[0].title, session: 30 }, link: '/sessions/1030', h: 8 },
    { kind: 'final_notes_received', params: { session: 49, count: 1 }, link: '/sessions/2049', h: 20 },
    { kind: 'project_awaiting_approval', params: { project: projects[3].title }, link: '/projects/4', h: 30 },
    { kind: 'excuse_submitted', params: { project: projects[0].title, name: nameOf(6), from: dateAgo(-3), to: dateAgo(-3) }, link: '/projects/1?tab=recording', h: 50 },
  ];
  return base.map((n, i) => ({ id: userId * 100 + i + 1, kind: n.kind, params: n.params, link: n.link, project_id: null, read_at: i > 3 ? ago(n.h - 1) : null, created_at: ago(n.h) }));
};

export const auditEntries = [
  ['login', 'user', 3, 3, null], ['note_decided', 'note', 4, 102701, { decision: 'studio' }], ['round_submitted', 'round', 7, 10271, { result: 'notes', notes: 3 }],
  ['version_uploaded', 'session', 5, 1032, { kind: 'raw', version_no: 1, reason: 'initial' }], ['check_in', 'project', 5, 1, { role: 'technician', outcome: 'full' }],
  ['excuse_submitted', 'project', 6, 1, { is_late: false }], ['project_created', 'project', 3, 4, { title: projects[3].title }],
  ['final_notes_forwarded', 'session', 3, 2048, null], ['quality_rated', 'quality_rating', 10, 11, { verdict: 'approved' }],
  ['personal_data_viewed', 'user', 1, 6, null], ['settings_updated', 'settings', 1, null, { review_hours: 48 }],
].map(([action, entity, userId, entityId, details], i) => ({
  id: 500 - i, action, entity, entity_id: entityId === null ? null : String(entityId), user_id: userId, user_name: nameOf(userId as number),
  details, ip: '10.0.0.12', created_at: ago(i * 5 + 1),
}));
