#!/usr/bin/env node
/**
 * Fills the development database with realistic sample data by driving the running API, exactly as
 * real users would (check-ins, uploads, reviews, rulings, mixing, final review, distribution).
 * Everything stays consistent: audio versions, light copies, timers, notifications, history, audit log.
 *
 *   1. npm run dev            (API must be running)
 *   2. npm run db:sample
 *
 * Uses the demo accounts from seed.sql (password Mushafs@2026). Development only.
 * Run it on a fresh database (`npm run db:reset`) or it will stop if the sample projects already exist.
 */
import { withClient } from './db.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to create sample data when NODE_ENV=production');
  process.exit(1);
}

const API = `http://localhost:${process.env.API_PORT || 4100}/api`;
const PASSWORD = 'Mushafs@2026';
const TAG = '(تجربة)';

// ------------------------------------------------------------------ HTTP client with one cookie per user
const jars = {};
async function call(who, method, url, body) {
  const headers = {};
  if (jars[who]) headers.cookie = jars[who];
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + url, { method, headers, body: payload });
  const set = res.headers.get('set-cookie');
  if (set) jars[who] = set.split(';')[0];
  const json = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(`${who} ${method} ${url} -> ${res.status} ${JSON.stringify(json?.error ?? json)}`);
  return json;
}
const get = (who, url) => call(who, 'GET', url);
const post = (who, url, body = {}) => call(who, 'POST', url, body);

const ACCOUNTS = {
  admin: 'admin', manager: 'manager', mujiz: 'mujiz', tech: 'tech', reader: 'reader',
  r1: 'reviewer1', r2: 'reviewer2', r3: 'reviewer3', mixing: 'mixing',
};

/** Short tone (mono 16-bit PCM WAV) so uploads stay small. */
function wav(seconds, base = 196) {
  const rate = 8000, n = seconds * rate, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = Math.sin(2 * Math.PI * base * t) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.25 * t)) + 0.4 * Math.sin(2 * Math.PI * base * 1.5 * t);
    b.writeInt16LE(Math.round(v * 5000), 44 + i * 2);
  }
  return b;
}
async function upload(who, sessionId, kind = 'raw', seconds = 75) {
  const fd = new FormData();
  fd.append('kind', kind);
  fd.append('file', new Blob([wav(seconds, kind === 'mixed' ? 220 : 196)], { type: 'audio/wav' }), `${kind}.wav`);
  return call(who, 'POST', `/sessions/${sessionId}/versions`, fd);
}

// ------------------------------------------------------------------ workflow helpers
let surahs = [];
let noteTypes = {};
const sessionsOf = async (pid) => (await get('manager', `/projects/${pid}/sessions`)).sessions;
const detail = (who, sid) => get(who, `/sessions/${sid}`);

async function checkIn(pid, outcome) {
  await post('reader', `/projects/${pid}/checkin`, { role: 'reader' });
  await post('mujiz', `/projects/${pid}/checkin`, { role: 'mujiz' });
  await post('tech', `/projects/${pid}/checkin`, { role: 'technician', outcome });
}

/** An ayah inside the session's range (any ayah if the session has no range). */
function ayah(s, k) {
  if (!s.start_surah) return { surah: 2 + (k % 3), ayah: 5 + k * 3 };
  const last = s.start_surah === s.end_surah ? s.end_ayah : surahs[s.start_surah - 1].ayah_count;
  return { surah: s.start_surah, ayah: Math.min(s.start_ayah + 2 + k * 4, last) };
}

async function addNotes(who, sid, items) {
  const d = await detail(who, sid);
  const ids = [];
  for (const [k, [type, text, sec]] of items.entries()) {
    const pos = ayah(d.session, k);
    const r = await post(who, `/rounds/${d.current_round.id}/notes`, { note_type_id: noteTypes[type], surah: pos.surah, ayah: pos.ayah, timestamp_sec: sec, body: text });
    ids.push(r.note.id);
  }
  return { roundId: d.current_round.id, ids };
}
const submit = async (who, sid) => post(who, `/rounds/${(await detail(who, sid)).current_round.id}/submit`);
const pass = (sid) => post('tech', `/sessions/${sid}/pass`);
const decide = (noteId, decision, comment = null) => post('mujiz', `/notes/${noteId}/decision`, { decision, comment });

// ------------------------------------------------------------------ main
async function main() {
  for (const [key, email] of Object.entries(ACCOUNTS)) {
    await post(key, '/auth/login', { email: `${email}@mushafs.local`, password: PASSWORD });
  }
  const existing = (await get('manager', '/projects')).projects;
  if (existing.some((p) => p.title.includes(TAG))) {
    console.error(`Sample projects already exist (titles containing "${TAG}"). Run "npm run db:reset" first for a clean start.`);
    process.exit(1);
  }
  const users = (await get('admin', '/users')).users;
  const id = (email) => users.find((u) => u.email === `${email}@mushafs.local`)?.id;
  surahs = (await get('manager', '/quran/surahs')).surahs;
  noteTypes = Object.fromEntries((await get('manager', '/note-types')).note_types.map((t) => [t.code, t.id]));
  const team = async (pid, withMixing = true) => {
    for (const [role, email] of [['mujiz', 'mujiz'], ['technician', 'tech'], ['reviewer1', 'reviewer1'], ['reviewer2', 'reviewer2'], ...(withMixing ? [['mixing_lead', 'mixing']] : [])]) {
      await post('manager', `/projects/${pid}/team`, { team_role: role, user_id: id(email) });
    }
  };

  // ---------------------------------------------------------------- A: mushaf in recording & review
  console.log('A) Mushaf in recording and review …');
  const A = (await post('manager', '/projects', {
    title: `مصحف الشيخ القارئ ${TAG}`, project_type: 'mushaf', riwayah: 'حفص عن عاصم', reader_id: id('reader'),
    recording_weekdays: [0, 1, 2, 3, 4, 5, 6], sessions_per_day: 1, description: 'مشروع تجريبي يغطي كل مراحل الجلسة.',
  })).project;
  await post('admin', `/projects/${A.id}/approve`);
  await team(A.id);
  await post('manager', `/projects/${A.id}/start`);
  // sittings: 1, 2, (3,4), 5, (6,7), 8  → 8 sessions recorded
  for (const outcome of ['full', 'full', 'two_sessions', 'full', 'two_sessions', 'full']) await checkIn(A.id, outcome);
  await checkIn(A.id, 'corrections_only');
  const sA = await sessionsOf(A.id);
  const S = (n) => sA[n - 1].id;
  for (const n of [1, 2, 3, 4, 5, 6]) await upload('tech', S(n));

  // Session 1: full path → raw ready for mixing
  const n1 = await addNotes('r1', S(1), [
    ['lahn_jali', 'لحن جلي في ضبط حركة الكلمة', 14], ['tajweed', 'الإخفاء غير واضح', 31], ['technical', 'ضجيج خفيف في الخلفية', 52],
  ]);
  await submit('r1', S(1));
  await decide(n1.ids[0], 'accept', 'يُعاد تسجيل الآية');
  await decide(n1.ids[1], 'reject', 'الأداء صحيح');
  const d1 = await detail('tech', S(1));
  const rerecord = d1.corrections.find((c) => c.note_id === n1.ids[0]);
  if (rerecord) await call('tech', 'PATCH', `/corrections/${rerecord.id}`, { is_rerecord: true, ayah_from: rerecord.ayah_from, ayah_to: rerecord.ayah_to });
  await upload('tech', S(1));
  for (const c of (await detail('mujiz', S(1))).corrections.filter((c) => c.status === 'done')) await post('mujiz', `/corrections/${c.id}/verify`);
  await submit('r2', S(1)); await pass(S(1));          // second review: no notes
  await submit('tech', S(1)); await pass(S(1));        // technical listening: no notes → ready for mixing

  // Session 2: second review found a note → mujiz accepted → waiting for technician corrections
  await submit('r1', S(2)); await pass(S(2));
  const n2 = await addNotes('r2', S(2), [['waqf_ibtida', 'وقف قبيح يغيّر المعنى', 22]]);
  await submit('r2', S(2));
  await decide(n2.ids[0], 'accept');

  // Session 3: first review notes waiting for the mujiz (one marked "listen in studio")
  const n3 = await addNotes('r1', S(3), [
    ['lahn_jali', 'إبدال حرف في الكلمة', 9], ['tajweed', 'مد منفصل أقصر من المعتاد', 27], ['performance', 'تفاوت في سرعة الأداء', 44],
  ]);
  await submit('r1', S(3));
  await decide(n3.ids[1], 'studio');

  // Session 4: first review with no notes → waiting for the one-click pass
  await submit('r1', S(4));
  // Sessions 5 and 6: waiting for the first reviewer (unread); 7 and 8: recorded, waiting for editing/upload

  // Mixing lead rates the first-session sample; general note on the reader; future excuse
  const q = (await get('mixing', `/projects/${A.id}/quality`)).ratings.find((r) => r.kind === 'first' && r.session_id);
  if (q) await post('mixing', `/quality/${q.id}/rate`, { verdict: 'approved', notes: null });
  await post('mujiz', `/projects/${A.id}/general-notes`, {
    body: 'يُطيل القارئ الغنّة في مواضع الإخفاء؛ يُنبَّه على ضبط زمنها.', references_text: 'تحفة الأطفال، باب أحكام النون الساكنة والتنوين',
  });
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await post('reader', `/projects/${A.id}/excuses`, { date_from: day(3), date_to: day(3), reason: 'موعد طبي' });
  await post('mujiz', `/projects/${A.id}/excuses`, { date_from: day(6), date_to: day(9), reason: 'سفر' });

  // ---------------------------------------------------------------- B: recitation, full journey to completion
  console.log('B) Recitation through mixing, final review and distribution …');
  const B = (await post('manager', '/projects', {
    title: `تلاوات مختارة ${TAG}`, project_type: 'recitation', riwayah: 'ورش عن نافع', reader_id: id('reader'),
    session_count: 2, recording_weekdays: [0, 1, 2, 3, 4], sessions_per_day: 2, description: 'مثال لمشروع أكمل كل المراحل.',
  })).project;
  await post('admin', `/projects/${B.id}/approve`);
  await team(B.id);
  await post('manager', `/projects/${B.id}/start`);
  await checkIn(B.id, 'two_sessions');
  const sB = (await sessionsOf(B.id)).map((s) => s.id);
  for (const sid of sB) await upload('tech', sid, 'raw', 60);
  for (const sid of sB) { await submit('r1', sid); await pass(sid); }
  for (const sid of sB) { await submit('r2', sid); await pass(sid); }
  for (const sid of sB) { await submit('tech', sid); await pass(sid); }
  for (const sid of sB) await upload('mixing', sid, 'mixed', 60);
  await post('manager', `/projects/${B.id}/final-review`, { split: 'whole', parts: [{ reviewer_id: id('reviewer3'), from: 1, to: 2 }] });
  for (const sid of sB) { await submit('r3', sid); await pass(sid); }
  for (const [recipient, channel, country, city, daysAgo, feedback] of [
    ['إذاعة القرآن الكريم', 'netia', 'السعودية', 'الرياض', 12, 'بُثّت ضمن البرنامج الصباحي'],
    ['قناة القرآن الكريم', 'satellite', 'السعودية', 'مكة المكرمة', 8, null],
    ['شريك إذاعي', 'portal', 'إندونيسيا', 'جاكرتا', 3, null],
  ]) {
    await post('manager', `/projects/${B.id}/distributions`, { recipient, channel, country, city, output_version: 'كامل', delivered_on: day(-daysAgo), notes: null, feedback });
  }
  await post('manager', `/projects/${B.id}/complete`);

  // ---------------------------------------------------------------- C & D: waiting for approval / approved not started
  console.log('C, D) Projects waiting for approval and for start …');
  await post('manager', '/projects', {
    title: `مصحف برواية قالون ${TAG}`, project_type: 'mushaf', riwayah: 'قالون عن نافع', reader_id: id('reader'),
    recording_weekdays: [0, 2, 4], sessions_per_day: 1, description: 'بانتظار اعتماد إدارة المركز.',
  });
  const D = (await post('manager', '/projects', {
    title: `مصحف برواية الدوري ${TAG}`, project_type: 'mushaf', riwayah: 'الدوري عن أبي عمرو', reader_id: id('reader'),
    recording_weekdays: [1, 3], sessions_per_day: 2, description: 'معتمد، والفريق لم يكتمل بعد.',
  })).project;
  await post('admin', `/projects/${D.id}/approve`);
  await post('manager', `/projects/${D.id}/team`, { team_role: 'mujiz', user_id: id('mujiz') });

  // ---------------------------------------------------------------- overdue alerts (move timers into the past)
  console.log('Alerts) Making some work overdue …');
  await withClient(async (db) => {
    const shift = async (sid, stage, hoursOverdue) => db.query(
      `UPDATE stage_timers SET started_at = now() - make_interval(hours => $3::int + allowed_hours::int),
         due_at = now() - make_interval(hours => $3::int), red_at = now() - make_interval(hours => $3::int) + make_interval(hours => orange_grace_hours::int),
         pm_red_at = now() - make_interval(hours => $3::int) + make_interval(hours => (orange_grace_hours + pm_grace_hours)::int)
       WHERE session_id = $1 AND stage = $2 AND completed_at IS NULL`,
      [sid, stage, hoursOverdue],
    );
    await shift(S(3), 'decision', 6);     // orange: mujiz is late
    await shift(S(5), 'review', 60);      // red: first reviewer is late, escalated to the production manager
    await shift(S(7), 'editing', 110);    // supervisor level
  });

  console.log(`\nDone. Sample projects are titled with "${TAG}".`);
  console.log('Alerts and their notifications appear within a minute (the timer check runs every TIMER_INTERVAL_SECONDS).');
}

main().catch((err) => {
  console.error(`\nSample data failed: ${err.message}`);
  if (String(err.message).includes('fetch failed')) console.error('Is the API running? Start it with: npm run dev');
  process.exit(1);
});
