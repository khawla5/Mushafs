/**
 * In-browser fake API for the static demo. Answers the same JSON shapes as the real
 * backend for every screen; changes are refused with a friendly "demo is read-only" error
 * (except harmless ones such as marking notifications read or switching language).
 */
import {
  ago, ahead, auditEntries, dateAgo, nameOf, noteTypes, notificationsFor, personas, projectById, projects, reviewerFor,
  sessionById, sessions, sessionsOf, settings, surahs, templates, userById, users,
  type DemoProject, type DemoSession,
} from './data';

export class DemoError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

// ------------------------------------------------------------------ persona (who is "signed in")
const PERSONA_KEY = 'mushafs.demo.persona';
export function currentPersona() {
  let key = 'production_manager';
  try { key = localStorage.getItem(PERSONA_KEY) || key; } catch { /* ignore */ }
  return personas.find((p) => p.key === key) ?? personas[0];
}
export function setPersona(key: string) {
  try { localStorage.setItem(PERSONA_KEY, key); } catch { /* ignore */ }
}
const me = () => userById(currentPersona().userId);
const isMgmt = () => me().roles.some((r) => ['admin', 'supervisor', 'production_manager'].includes(r));
const has = (...roles: string[]) => me().roles.some((r) => roles.includes(r));

// ------------------------------------------------------------------ helpers
const surah = (n: number | null) => (n ? surahs[n - 1] : null);
const teamRolesOf = (p: DemoProject, userId: number) => p.team.filter((m) => m.user_id === userId).map((m) => m.team_role);

function canView(p: DemoProject) {
  if (isMgmt()) return true;
  if (p.status === 'pending_approval') return false;
  return p.reader_id === me().id || teamRolesOf(p, me().id).length > 0;
}
function viewProject(id: number) {
  const p = projectById(id);
  if (!p) throw new DemoError(404, 'project_not_found');
  if (!canView(p)) throw new DemoError(403, 'not_project_member');
  return p;
}

const ROUND_ORDER = ['first', 'second', 'technical', 'final'] as const;

function sessionRow(s: DemoSession) {
  const a = surah(s.start_surah), b = surah(s.end_surah);
  const p = projectById(s.project_id)!;
  const d = detail(s);
  return {
    id: s.id, number: s.number, title: s.title, start_surah: s.start_surah, start_ayah: s.start_ayah, end_surah: s.end_surah, end_ayah: s.end_ayah,
    start_surah_ar: a?.name_ar, start_surah_en: a?.name_en, end_surah_ar: b?.name_ar, end_surah_en: b?.name_en,
    stage: s.stage, stage_entered_at: ago(s.enteredHoursAgo), recorded_at: s.stage === 'pending' ? null : ago(s.enteredHoursAgo + 30),
    current_round_type: s.round, current_reviewer_name: s.round ? nameOf(reviewerFor(p, s, s.round)) : null,
    unread: s.unread, alert_level: s.alert, due_at: d.timers[0]?.due_at ?? null,
    notes_count: d.notes.length, open_corrections: d.corrections.filter((c: any) => c.status === 'open').length,
    raw_version: d.versions.find((v: any) => v.kind === 'raw' && v.is_approved)?.version_no ?? null,
    mixed_version: d.versions.find((v: any) => v.kind === 'mixed' && v.is_approved)?.version_no ?? null,
  };
}

// ------------------------------------------------------------------ session detail generator
const NOTE_TEXTS: [number, string][] = [
  [1, 'لحن في ضبط حركة الكلمة'], [2, 'الإخفاء غير واضح'], [3, 'وقف قبيح يغيّر المعنى'], [4, 'تفاوت في سرعة الأداء'],
  [5, 'ضجيج خفيف في الخلفية'], [2, 'مد منفصل أقصر من المعتاد'], [1, 'إبدال حرف في الكلمة'],
];

function ayahAt(s: DemoSession, k: number) {
  if (!s.start_surah) return { surah: 1 + ((s.number + k) % 113), ayah: 1 + k };
  const su = surah(s.start_surah)!;
  const last = s.start_surah === s.end_surah ? s.end_ayah! : su.ayah_count;
  return { surah: s.start_surah, ayah: Math.min(s.start_ayah! + 2 + k * 3, last) };
}

function detail(s: DemoSession) {
  const p = projectById(s.project_id)!;
  const versions: any[] = [];
  const rounds: any[] = [];
  const notes: any[] = [];
  const corrections: any[] = [];
  const events: any[] = [];
  const t0 = s.enteredHoursAgo + 24 * 6;
  const ev = (to_stage: string, actor: number, h: number) => events.push({ id: s.id * 100 + events.length, to_stage, actor_name: nameOf(actor), created_at: ago(h) });

  if (s.stage === 'pending') return { versions, rounds, notes, corrections, events, timers: [] as any[], current: null as any };
  ev('editing', 5, t0);
  if (s.stage === 'editing') {
    return { versions, rounds, notes, corrections, events, timers: [{ stage: 'editing', due_at: ahead(44), alert_level: 0, allowed_hours: 48, assignee_name: nameOf(5) }], current: null };
  }

  const addVersion = (kind: 'raw' | 'mixed', no: number, h: number, reason: string, by: number) => {
    versions.forEach((v) => { if (v.kind === kind) v.is_approved = false; });
    const v = {
      id: s.id * 10 + versions.length + 1, kind, version_no: no, original_name: `${p.title} - S${String(s.number).padStart(2, '0')} - ${kind}.wav`,
      mime_type: 'audio/wav', size_bytes: 312_000_000 + s.number * 1_234_567, duration_sec: 1795 - s.number * 3, light_status: 'ready',
      is_approved: true, upload_reason: reason, uploaded_at: ago(h), uploaded_by_name: nameOf(by),
    };
    versions.push(v);
    return v;
  };
  const addRound = (type: string, version: any, h: number, status: 'open' | 'submitted', noteCount: number, decided: boolean) => {
    const reviewer = reviewerFor(p, s, type);
    const r: any = {
      id: s.id * 10 + rounds.length + 1, round_type: type, round_no: rounds.length + 1, reviewer_id: reviewer, reviewer_name: nameOf(reviewer),
      status, result: status === 'submitted' ? (noteCount ? 'notes' : 'no_notes') : null, assigned_at: ago(h),
      first_opened_at: s.unread && status === 'open' ? null : ago(h - 1), submitted_at: status === 'submitted' ? ago(h - 20) : null,
      version_id: version.id, version_kind: version.kind, version_no: version.version_no, notes_count: noteCount,
    };
    rounds.push(r);
    ev('in_review', 5, h);
    for (let k = 0; k < noteCount; k++) {
      const [typeId, body] = NOTE_TEXTS[(s.number + rounds.length + k) % NOTE_TEXTS.length];
      const nt = noteTypes[typeId - 1];
      const pos = ayahAt(s, k + rounds.length);
      const su = surah(pos.surah)!;
      const routed = nt.is_technical;
      const decision = routed ? 'technician' : decided ? (k % 3 === 2 ? 'reject' : 'accept') : k === 1 ? 'studio' : null;
      const n = {
        id: s.id * 100 + notes.length + 1, session_id: s.id, round_id: r.id, version_id: version.id, author_name: r.reviewer_name,
        note_type_id: nt.id, type_code: nt.code, type_ar: nt.name_ar, type_en: nt.name_en, is_technical: nt.is_technical, is_clear_error: nt.is_clear_error,
        surah: pos.surah, ayah: pos.ayah, surah_ar: su.name_ar, surah_en: su.name_en, timestamp_sec: 12 + k * 21 + (s.number % 7),
        body, routed_to_technician: routed, current_decision: decision, round_type: type, round_no: r.round_no,
        decisions: decision && !routed ? [{ decision, comment: decision === 'reject' ? 'الأداء صحيح' : null, decided_at: ago(h - 26), by: nameOf(4) }] : [],
      };
      notes.push(n);
      if (decision === 'accept' || decision === 'technician') {
        const done = decided && status === 'submitted' && s.stage !== 'in_corrections';
        corrections.push({
          id: n.id, note_id: n.id, session_id: s.id, status: done ? 'verified' : 'open', is_rerecord: done && k === 0, surah: n.surah,
          ayah_from: n.ayah, ayah_to: n.ayah, note_body: n.body, timestamp_sec: n.timestamp_sec, round_id: r.id,
          done_at: done ? ago(h - 40) : null, done_by_name: done ? nameOf(5) : null, verified_at: done ? ago(h - 44) : null, verified_by_name: done ? nameOf(4) : null,
        });
      }
    }
    return r;
  };

  let raw = addVersion('raw', 1, t0 - 2, 'initial', 5);
  const timers: any[] = [];
  let current: any = null;
  const later = ['in_review', 'in_decision', 'in_corrections', 'awaiting_pass', 'ready_for_mixing', 'mixed', 'pm_forward', 'done'];
  const roundIdx = s.round ? ROUND_ORDER.indexOf(s.round) : -1;

  if (s.stage === 'in_review' && roundIdx === 0) {
    current = addRound('first', raw, s.enteredHoursAgo, 'open', 0, false);
  } else if (['in_decision', 'in_corrections', 'awaiting_pass'].includes(s.stage)) {
    const count = s.stage === 'awaiting_pass' ? 0 : s.stage === 'in_decision' ? 3 : 2;
    current = addRound('first', raw, s.enteredHoursAgo + 48, 'submitted', count, s.stage === 'in_corrections');
    ev(s.stage, s.stage === 'in_corrections' ? 4 : 7, s.enteredHoursAgo);
  } else if (later.includes(s.stage)) {
    addRound('first', raw, t0 - 10, 'submitted', 2, true);
    raw = addVersion('raw', 2, t0 - 70, 'corrections', 5);
    if (s.stage === 'in_review' && roundIdx === 1) current = addRound('second', raw, s.enteredHoursAgo, 'open', 0, false);
    else {
      addRound('second', raw, t0 - 80, 'submitted', s.number % 4 === 0 ? 1 : 0, true);
      if (s.stage === 'in_review' && roundIdx === 2) current = addRound('technical', raw, s.enteredHoursAgo, 'open', 0, false);
      else {
        addRound('technical', raw, t0 - 100, 'submitted', 0, true);
        ev('ready_for_mixing', 5, t0 - 110);
        if (['mixed', 'pm_forward', 'done'].includes(s.stage) || (s.stage === 'in_review' && roundIdx === 3) || (s.stage === 'in_corrections' && p.id === 2)) {
          const mixed = addVersion('mixed', 1, t0 - 130, 'mixed', 10);
          ev('mixed', 10, t0 - 130);
          if (s.stage === 'in_review') current = addRound('final', mixed, s.enteredHoursAgo, 'open', 0, false);
          else if (s.stage === 'pm_forward') { current = addRound('final', mixed, s.enteredHoursAgo + 30, 'submitted', 1, false); ev('pm_forward', 9, s.enteredHoursAgo); }
          else if (s.stage === 'in_corrections') { current = addRound('final', mixed, s.enteredHoursAgo + 40, 'submitted', 1, true); ev('in_corrections', 4, s.enteredHoursAgo); }
          else { addRound('final', mixed, t0 - 150, 'submitted', 0, true); ev('done', 9, t0 - 160); }
        }
      }
    }
  }
  if (s.stage === 'in_review') timers.push({ stage: 'review', due_at: ahead(48 - s.enteredHoursAgo), alert_level: s.alert, allowed_hours: 48, assignee_name: current?.reviewer_name });
  if (s.stage === 'in_decision') timers.push({ stage: 'decision', due_at: ahead(24 - s.enteredHoursAgo), alert_level: s.alert, allowed_hours: 24, assignee_name: nameOf(4) });
  if (s.stage === 'in_corrections') timers.push({ stage: 'corrections', due_at: ahead(48 - s.enteredHoursAgo), alert_level: s.alert, allowed_hours: 48, assignee_name: nameOf(p.id === 2 ? 10 : 5) });
  return { versions, rounds, notes, corrections, events, timers, current };
}

function sessionDetail(id: number) {
  const s = sessionById(id);
  if (!s) throw new DemoError(404, 'session_not_found');
  const p = viewProject(s.project_id);
  const d = detail(s);
  const roles = teamRolesOf(p, me().id).concat(has('mixing_lead') ? ['mixing_lead'] : []);
  const round = d.current;
  const finalPhase = round?.round_type === 'final';
  const a = surah(s.start_surah), b = surah(s.end_surah);
  return {
    session: {
      id: s.id, project_id: p.id, number: s.number, title: s.title, stage: s.stage, start_surah: s.start_surah, start_ayah: s.start_ayah,
      end_surah: s.end_surah, end_ayah: s.end_ayah, start_surah_ar: a?.name_ar, start_surah_en: a?.name_en, end_surah_ar: b?.name_ar, end_surah_en: b?.name_en,
      project_title: p.title, project_status: p.status, session_count: p.session_count, riwayah: p.riwayah, reader_name: nameOf(p.reader_id),
      current_round_id: round?.id ?? null,
    },
    versions: d.versions.slice().reverse(),
    rounds: d.rounds,
    notes: d.notes,
    corrections: d.corrections,
    events: d.events,
    quality: p.id === 1 && s.number === 1
      ? [{ id: 11, kind: 'first', verdict: 'approved', notes: null, requested_at: ago(24 * 60), rated_at: ago(24 * 59), rated_by_name: nameOf(10) }]
      : p.id === 1 && s.number === 26 ? [{ id: 12, kind: 'random', verdict: null, notes: null, requested_at: ago(20) }] : [],
    timers: d.timers,
    current_round: round,
    can: {
      upload_raw: roles.includes('technician') && (s.stage === 'editing' || (s.stage === 'in_corrections' && !finalPhase)),
      upload_mixed: roles.includes('mixing_lead') && s.stage === 'in_corrections' && finalPhase,
      review: !!round && round.status === 'open' && round.reviewer_id === me().id && s.stage === 'in_review',
      decide: roles.includes('mujiz') && s.stage === 'in_decision',
      pass: s.stage === 'awaiting_pass' && (roles.includes('technician') || isMgmt()),
      forward: s.stage === 'pm_forward' && has('production_manager', 'admin'),
      extra_round: isMgmt() && s.stage === 'awaiting_pass',
      edit_corrections: roles.includes('technician'),
      verify_corrections: roles.includes('mujiz'),
      rate_quality: roles.includes('mixing_lead'),
    },
  };
}

// ------------------------------------------------------------------ project views
function projectStats(p: DemoProject) {
  const ss = sessionsOf(p.id);
  return {
    total: p.session_count,
    recorded: ss.filter((s) => s.stage !== 'pending').length,
    ready: ss.filter((s) => ['ready_for_mixing', 'mixed', 'done'].includes(s.stage) || (p.id === 2)).length,
    mixed: ss.filter((s) => ['mixed', 'done'].includes(s.stage) || (p.id === 2)).length,
    done: ss.filter((s) => s.stage === 'done').length,
  };
}

function projectRow(p: DemoProject) {
  const st = projectStats(p);
  return {
    ...p, team: undefined, template_code: templates[p.template_id - 1].code, uses_hizb_ranges: p.project_type === 'mushaf', reader_name: nameOf(p.reader_id),
    recorded_count: st.recorded, ready_count: st.ready, done_count: st.done,
    alert_level: Math.max(0, ...sessionsOf(p.id).map((s) => s.alert)),
  };
}

const distributions = [
  { id: 1, project_id: 3, recipient: 'إذاعة القرآن الكريم', channel: 'netia', country: 'السعودية', city: 'الرياض', output_version: 'حسب الحديث', delivered_on: dateAgo(140), notes: null, feedback: 'بُث ضمن البرنامج الصباحي', created_by_name: nameOf(3) },
  { id: 2, project_id: 3, recipient: 'قناة القرآن الكريم', channel: 'satellite', country: 'السعودية', city: 'مكة المكرمة', output_version: 'كامل', delivered_on: dateAgo(135), notes: null, feedback: null, created_by_name: nameOf(3) },
  { id: 3, project_id: 3, recipient: 'إذاعة نداء الإسلام', channel: 'direct', country: 'السعودية', city: 'مكة المكرمة', output_version: 'حسب الحديث', delivered_on: dateAgo(120), notes: null, feedback: null, created_by_name: nameOf(3) },
  { id: 4, project_id: 3, recipient: 'شريك إذاعي', channel: 'portal', country: 'إندونيسيا', city: 'جاكرتا', output_version: 'كامل', delivered_on: dateAgo(90), notes: 'نسخة مترجمة العناوين', feedback: null, created_by_name: nameOf(3) },
];

function today(p: DemoProject) {
  const ss = sessionsOf(p.id);
  const pending = ss.filter((s) => s.stage === 'pending');
  const prev = ss.filter((s) => s.stage !== 'pending').pop();
  const mapS = (s: DemoSession | undefined) => (s ? sessionRow(s) : null);
  const seats: string[] = [];
  if (p.reader_id === me().id) seats.push('reader');
  for (const r of teamRolesOf(p, me().id)) if (r === 'mujiz' || r === 'technician') seats.push(r);
  return {
    project: { id: p.id, title: p.title, status: p.status, recording_weekdays: p.recording_weekdays, sessions_per_day: p.sessions_per_day },
    today: new Date().toISOString().slice(0, 10),
    is_recording_day: p.recording_weekdays.includes(new Date().getDay()),
    previous: mapS(prev), next: mapS(pending[0]), upcoming: pending.slice(1, 6).map(mapS),
    sitting: null, my_seats: seats,
    can_check_in: { reader: seats.includes('reader') && p.status === 'recording', mujiz: false, technician: false },
    excuse_window: { opens_at: ago(20), cutoff_next_day: ahead(4) },
  };
}

function attendance(projectId: number | null, userId: number | null) {
  const sittings = Array.from({ length: 10 }, (_, i) => {
    const sess = 32 - i;
    return {
      id: 900 - i, project_id: 1, project_title: projects[0].title, sitting_date: dateAgo(i * 2 + 1), outcome: i === 3 ? 'corrections_only' : 'full', outcome_note: null,
      opened_at: ago((i * 2 + 1) * 24), closed_at: ago((i * 2 + 1) * 24 - 1), session_numbers: i === 3 ? null : [sess],
      checkins: [
        { role: 'reader', user_id: 6, full_name: nameOf(6), checked_in_at: ago((i * 2 + 1) * 24 + 1) },
        { role: 'mujiz', user_id: 4, full_name: nameOf(4), checked_in_at: ago((i * 2 + 1) * 24 + 0.8) },
        { role: 'technician', user_id: 5, full_name: nameOf(5), checked_in_at: ago((i * 2 + 1) * 24) },
      ],
    };
  });
  const excuses = [
    { id: 1, project_id: 1, project_title: projects[0].title, user_id: 6, full_name: nameOf(6), date_from: dateAgo(-3), date_to: dateAgo(-3), reason: 'موعد طبي', is_late: false, status: 'accepted' },
    { id: 2, project_id: 1, project_title: projects[0].title, user_id: 4, full_name: nameOf(4), date_from: dateAgo(12), date_to: dateAgo(9), reason: 'سفر', is_late: true, status: 'accepted' },
  ];
  const f = <T extends { project_id: number }>(rows: T[]) => rows.filter((r) => !projectId || r.project_id === projectId);
  return {
    sittings: f(sittings).filter((s) => !userId || s.checkins.some((c) => c.user_id === userId)),
    excuses: f(excuses).filter((e) => !userId || e.user_id === userId),
  };
}

// ------------------------------------------------------------------ home ("my work")
function myWork() {
  const uid = me().id;
  const visible = projects.filter(canView);
  const timerOf = (s: DemoSession) => ({ alert_level: s.alert, due_at: detail(s).timers[0]?.due_at ?? null });
  const recording = visible.filter((p) => p.status === 'recording' && (p.reader_id === uid || teamRolesOf(p, uid).some((r) => r === 'mujiz' || r === 'technician')))
    .map((p) => ({ id: p.id, title: p.title, status: p.status, seat: p.reader_id === uid ? 'reader' : teamRolesOf(p, uid)[0] }));
  const reviews = sessions.filter((s) => s.stage === 'in_review' && s.round && reviewerFor(projectById(s.project_id)!, s, s.round) === uid)
    .map((s) => ({ round_id: s.id * 10, round_type: s.round, assigned_at: ago(s.enteredHoursAgo), unread: s.unread, session_id: s.id, number: s.number, project_id: s.project_id, project_title: projectById(s.project_id)!.title, ...timerOf(s) }));
  const decisions = has('mujiz') ? sessions.filter((s) => s.stage === 'in_decision')
    .map((s) => ({ session_id: s.id, number: s.number, project_id: s.project_id, project_title: projectById(s.project_id)!.title, pending_notes: 3, ...timerOf(s) })) : [];
  const technician = has('technician') ? sessions.filter((s) => ['editing', 'awaiting_pass'].includes(s.stage) || (s.stage === 'in_corrections' && s.project_id === 1))
    .map((s) => ({ session_id: s.id, number: s.number, stage: s.stage, project_id: s.project_id, project_title: projectById(s.project_id)!.title, open_corrections: s.stage === 'in_corrections' ? 2 : 0, ...timerOf(s) })) : [];
  const quality = has('mixing_lead') ? [{ id: 12, kind: 'random', requested_at: ago(20), session_id: 1026, number: 26, project_id: 1, project_title: projects[0].title }] : [];
  const mixing = has('mixing_lead') ? [{ project_id: 2, project_title: projects[1].title, status: 'final_review', to_mix: 0, mixed: 0, final_corrections: 1 }] : [];
  const finalForward = has('production_manager', 'admin') ? [{ session_id: 2049, number: 49, project_id: 2, project_title: projects[1].title, notes: 1 }] : [];
  const management = isMgmt() ? {
    awaitingApproval: [{ id: 4, title: projects[3].title, created_at: projects[3].created_at }],
    awaitingStart: [], awaitingFinalSplit: [], inDistribution: [],
    alerts: sessions.filter((s) => s.alert > 0).map((s) => {
      const d = detail(s);
      return { id: s.id, stage: d.timers[0]?.stage ?? 'review', alert_level: s.alert, due_at: d.timers[0]?.due_at, session_id: s.id, number: s.number, project_id: s.project_id, project_title: projectById(s.project_id)!.title, assignee: d.timers[0]?.assignee_name };
    }),
  } : null;
  return { recording, reviews, decisions, technician, quality, mixing, finalForward, management };
}

// ------------------------------------------------------------------ dashboard & reports
function dashboard(view: string) {
  const detailed = view === 'detailed' && isMgmt();
  const items = projects.filter((p) => p.status !== 'pending_approval').map((p) => {
    const st = projectStats(p);
    const progress = { total: st.total, recorded: st.recorded, reviewed: st.ready, mixed: st.mixed, done: st.done };
    const dist = distributions.filter((d) => d.project_id === p.id);
    const reach = { recipients: new Set(dist.map((d) => d.recipient)).size, countries: new Set(dist.map((d) => d.country)).size, deliveries: dist.length };
    if (!detailed) return { id: p.id, title: p.title, type: p.project_type, riwayah: p.riwayah, status: p.status, progress, distribution: reach };
    const ring = p.id === 1
      ? { recording: { recorded: 32, expected: 36, pct: 89, status: 'on_plan' }, editing: { on_time: 30, late: 2, pct: 94 }, reviews: { on_time: 52, late: 9, pct: 85 }, quality: { accepted: 41, missed: 3, pct: 93 } }
      : p.id === 2
        ? { recording: { recorded: 60, expected: 60, pct: 100, status: 'on_plan' }, editing: { on_time: 58, late: 2, pct: 97 }, reviews: { on_time: 160, late: 14, pct: 92 }, quality: { accepted: 77, missed: 2, pct: 97 } }
        : { recording: { recorded: 42, expected: 42, pct: 100, status: 'on_plan' }, editing: { on_time: 42, late: 0, pct: 100 }, reviews: { on_time: 126, late: 4, pct: 97 }, quality: { accepted: 21, missed: 0, pct: 100 } };
    const alerts = { orange: sessionsOf(p.id).filter((s) => s.alert === 1).length, red: sessionsOf(p.id).filter((s) => s.alert >= 2).length };
    const health = p.id === 1 ? { color: 'red', reason: 'red_alerts', value: alerts.red } : { color: 'green', reason: null, value: null };
    const stalls = sessionsOf(p.id).filter((s) => s.alert > 0).map((s) => ({ id: s.id, number: s.number, stage: s.stage, stage_entered_at: ago(s.enteredHoursAgo), alert_level: s.alert, assignee: detail(s).timers[0]?.assignee_name }));
    return { id: p.id, title: p.title, type: p.project_type, riwayah: p.riwayah, status: p.status, reader_name: nameOf(p.reader_id), progress, rings: ring, distribution: reach, alerts, stalls, health };
  });
  if (!detailed) return { view: 'general', projects: items, reach: { recipients: 4, countries: 2 } };
  return { view: 'detailed', projects: items, center_health: { green: 2, blue: 0, red: 1 }, reach: [{ country: 'السعودية', recipients: 3 }, { country: 'إندونيسيا', recipients: 1 }] };
}

const REPORTS: Record<string, unknown> = {
  'production-status': projects.filter((p) => p.status !== 'pending_approval').map((p) => {
    const ss = sessionsOf(p.id);
    const c = (...st: string[]) => ss.filter((s) => st.includes(s.stage)).length;
    return { title: p.title, status: p.status, session_count: p.session_count, pending: c('pending'), editing: c('editing'), in_review: c('in_review'),
      in_decision: c('in_decision', 'pm_forward'), in_corrections: c('in_corrections', 'awaiting_pass'), ready_for_mixing: c('ready_for_mixing'), mixed: c('mixed'), done: c('done'),
      bottleneck: p.id === 1 ? 'in_review' : p.id === 2 ? 'in_review' : null };
  }),
  'stage-times': [
    { stage: 'editing', year: 2026, person: nameOf(5), items: 74, avg_hours: 21.4, on_time_pct: 96 },
    { stage: 'review', year: 2026, person: nameOf(7), items: 72, avg_hours: 38.2, on_time_pct: 81 },
    { stage: 'review', year: 2026, person: nameOf(8), items: 96, avg_hours: 30.5, on_time_pct: 90 },
    { stage: 'review', year: 2026, person: nameOf(9), items: 38, avg_hours: 26.1, on_time_pct: 95 },
    { stage: 'decision', year: 2026, person: nameOf(4), items: 61, avg_hours: 14.8, on_time_pct: 92 },
    { stage: 'corrections', year: 2026, person: nameOf(5), items: 44, avg_hours: 29.7, on_time_pct: 89 },
    { stage: 'mixing', year: 2026, person: nameOf(10), items: 1, avg_hours: 610, on_time_pct: 0 },
  ],
  'recording-commitment': {
    projects: [{ project: projects[0].title, agreed_days: 38, recorded_days: 32, excused_days: 4, unexplained_days: 2, extra_days: 1 }],
    excuses: [{ person: nameOf(6), reason: 'موعد طبي', count: 1, late: 0, days: 1 }, { person: nameOf(4), reason: 'سفر', count: 1, late: 1, days: 4 }],
  },
  'clear-errors': {
    byProject: [
      { title: projects[0].title, clear_errors: 14, recorded_sessions: 32, caught_first: 9, caught_second: 4, caught_technical: 0, caught_extra: 0, caught_final: 1 },
      { title: projects[1].title, clear_errors: 19, recorded_sessions: 60, caught_first: 12, caught_second: 5, caught_technical: 0, caught_extra: 1, caught_final: 1 },
    ],
    byMujiz: [{ mujiz: nameOf(4), clear_errors: 33, recorded_sessions: 134, per_session: 0.25 }],
  },
  'reader-quality': [
    { title: projects[0].title, reader: nameOf(6), recorded_sessions: 32, accepted_notes: 41, notes_per_session: 1.28, by_type: { lahn_jali: 14, tajweed: 15, waqf_ibtida: 8, technical: 4 }, rerecorded_sessions: 6 },
    { title: projects[1].title, reader: nameOf(11), recorded_sessions: 60, accepted_notes: 77, notes_per_session: 1.28, by_type: { lahn_jali: 19, tajweed: 31, waqf_ibtida: 17, technical: 10 }, rerecorded_sessions: 11 },
  ],
  'review-quality': [
    { reviewer: nameOf(7), rounds: 92, no_notes_rounds: 31, notes: 118, caught: 92, rejected: 26, rejected_pct: 22, missed: 7, missed_clear: 2 },
    { reviewer: nameOf(8), rounds: 104, no_notes_rounds: 58, notes: 61, caught: 49, rejected: 12, rejected_pct: 20, missed: 3, missed_clear: 1 },
    { reviewer: nameOf(9), rounds: 38, no_notes_rounds: 33, notes: 6, caught: 5, rejected: 1, rejected_pct: 17, missed: 0, missed_clear: 0 },
  ],
  'recording-quality': {
    ratings: [
      { title: projects[0].title, kind: 'first', session: 1, verdict: 'approved', notes: null, rated_at: ago(24 * 59), rated_by: nameOf(10) },
      { title: projects[1].title, kind: 'first', session: 1, verdict: 'approved', notes: null, rated_at: ago(24 * 170), rated_by: nameOf(10) },
      { title: projects[1].title, kind: 'random', session: 23, verdict: 'not_suitable', notes: 'صدى خفيف في الغرفة', rated_at: ago(24 * 120), rated_by: nameOf(10) },
    ],
    technical: [{ title: projects[0].title, technical_notes: 6, confirmed: 4 }, { title: projects[1].title, technical_notes: 13, confirmed: 10 }],
  },
  'speed-vs-quality': [
    { title: projects[1].title, recording_weeks: 17.1, recorded_sessions: 60, accepted_notes: 77, notes_per_session: 1.28 },
    { title: projects[0].title, recording_weeks: 9.4, recorded_sessions: 32, accepted_notes: 41, notes_per_session: 1.28 },
  ],
  workload: [
    { person: nameOf(9), stage: 'review', items: 8, worst_alert: 1 }, { person: nameOf(8), stage: 'review', items: 7, worst_alert: 1 },
    { person: nameOf(7), stage: 'review', items: 2, worst_alert: 2 }, { person: nameOf(4), stage: 'decision', items: 1, worst_alert: 1 },
    { person: nameOf(5), stage: 'corrections', items: 1, worst_alert: 0 }, { person: nameOf(10), stage: 'corrections', items: 1, worst_alert: 0 },
  ],
  'annual-output': [{ year: 2026, project_type: 'hadith', completed: 1, in_distribution: 0 }],
  'distribution-reach': [{ title: projects[2].title, deliveries: 4, recipients: 4, countries: 2, channels: ['netia', 'satellite', 'direct', 'portal'] }],
};

// ------------------------------------------------------------------ router
const readIds = new Set<number>();
let allRead = false;

export async function demoRequest(method: string, rawUrl: string, body?: unknown): Promise<any> {
  await new Promise((r) => setTimeout(r, 120)); // feel like a network call
  const url = new URL(rawUrl, 'http://demo');
  const path = url.pathname;
  const q = url.searchParams;
  const seg = path.split('/').filter(Boolean);
  const num = (i: number) => Number(seg[i]);

  if (method !== 'GET') {
    if (path === '/notifications/read-all') { allRead = true; return { ok: true }; }
    if (/^\/notifications\/\d+\/read$/.test(path)) { readIds.add(num(1)); return { ok: true }; }
    if (path === '/auth/me' && method === 'PATCH') return { user: { ...me(), locale: (body as any)?.locale ?? 'ar' } };
    if (path === '/auth/logout') return { ok: true };
    throw new DemoError(403, 'demo_read_only');
  }

  switch (true) {
    case path === '/auth/me': return { user: me() };
    case path === '/me/work': return myWork();
    case path === '/templates': return { templates };
    case path === '/quran/surahs': return { surahs };
    case path === '/note-types': return { note_types: noteTypes };
    case path === '/settings': return { settings };
    case path === '/dashboard': return dashboard(q.get('view') ?? 'general');
    case path === '/reports': return { reports: Object.keys(REPORTS) };
    case seg[0] === 'reports' && seg.length === 2: {
      if (!isMgmt()) throw new DemoError(403, 'forbidden');
      return { report: seg[1], data: REPORTS[seg[1]] ?? [] };
    }
    case path === '/notifications': {
      const items = notificationsFor(me().id).map((n) => ({ ...n, read_at: allRead || readIds.has(n.id) ? n.read_at ?? ago(0) : n.read_at }));
      return { notifications: items, unread: items.filter((n) => !n.read_at).length };
    }
    case path === '/users': {
      const role = q.get('role');
      return { users: users.filter((x) => !role || x.roles.includes(role as any)) };
    }
    case path === '/audit': return { entries: auditEntries, total: auditEntries.length };
    case path === '/attendance': return attendance(q.get('project_id') ? Number(q.get('project_id')) : null, q.get('user_id') ? Number(q.get('user_id')) : null);
    case seg[0] === 'auth' && seg[1] === 'private': {
      const target = seg[2] === 'me' ? me().id : num(2);
      if (target !== me().id && !has('admin')) throw new DemoError(403, 'personal_data_restricted');
      return { national_id: '******4821', iban: '****************7519', has_document: false, document_name: null, updated_at: ago(24 * 30) };
    }
    case path === '/projects': {
      const status = q.get('status');
      return { projects: projects.filter(canView).filter((p) => !status || p.status === status).map(projectRow) };
    }
    case seg[0] === 'projects' && seg.length === 2: {
      const p = viewProject(num(1));
      return {
        project: projectRow(p), stats: projectStats(p),
        team: p.team.map((m, i) => ({ id: p.id * 10 + i, team_role: m.team_role, user_id: m.user_id, full_name: nameOf(m.user_id), assigned_at: p.approved_at })),
        me: { team_roles: teamRolesOf(p, me().id), is_reader: p.reader_id === me().id, is_management: isMgmt() },
      };
    }
    case seg[0] === 'projects' && seg.length === 3: {
      const p = viewProject(num(1));
      switch (seg[2]) {
        case 'sessions': return { sessions: sessionsOf(p.id).map(sessionRow) };
        case 'today': return today(p);
        case 'general-notes': return { notes: p.id === 1 ? [{ id: 1, author_name: nameOf(4), body: 'يكثر القارئ من إطالة الغنّة في الإخفاء؛ يُنبَّه على ضبط زمنها.', references_text: 'تحفة الأطفال، باب أحكام النون الساكنة', created_at: ago(24 * 20) }] : [] };
        case 'journey': return { steps: [
          { key: 'approved', at: p.approved_at }, { key: 'recording', at: p.started_at, end: p.recording_completed_at, months: p.started_at ? 2.2 : null },
          { key: 'reviews', at: p.started_at, end: p.recording_completed_at, months: p.started_at ? 2.1 : null }, { key: 'mixing', at: p.mixing_started_at, end: p.final_review_started_at },
          { key: 'final_review', at: p.final_review_started_at }, { key: 'first_broadcast', at: p.id === 3 ? distributions[0].delivered_on : null, detail: p.id === 3 ? distributions[0].recipient : null },
          { key: 'published', at: p.completed_at },
        ] };
        case 'quality': return { ratings: p.id === 1 ? [
          { id: 11, kind: 'first', session_id: 1001, session_number: 1, verdict: 'approved', notes: null, requested_at: ago(24 * 60), rated_at: ago(24 * 59), rated_by_name: nameOf(10) },
          { id: 12, kind: 'random', session_id: 1026, session_number: 26, verdict: null, notes: null, requested_at: ago(20) },
        ] : [] };
        case 'final-review': return { assignments: p.id === 2 ? [
          { id: 1, reviewer_name: nameOf(9), split_label: 'half', session_from: 1, session_to: 30, submitted: 30, total: 30 },
          { id: 2, reviewer_name: nameOf(8), split_label: 'half', session_from: 31, session_to: 60, submitted: 10, total: 30 },
        ] : [] };
        case 'distributions': return { distributions: distributions.filter((d) => d.project_id === p.id) };
        default: break;
      }
      break;
    }
    case seg[0] === 'projects' && seg[2] === 'team' && seg[3] === 'history': {
      const p = viewProject(num(1));
      return { history: p.team.map((m, i) => ({ id: i, team_role: m.team_role, full_name: nameOf(m.user_id), assigned_at: p.approved_at, assigned_by_name: nameOf(3), removed_at: null })) };
    }
    case seg[0] === 'sessions' && seg.length === 2: return sessionDetail(num(1));
    default: break;
  }
  throw new DemoError(404, 'not_found');
}


export { DEMO_AUDIO } from "./mode";
