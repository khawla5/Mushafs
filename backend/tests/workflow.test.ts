/**
 * End-to-end test of the BRD target workflow (section 8) through the REST API and PostgreSQL:
 * project approval -> team -> check-in -> upload -> reviews -> mujiz decisions -> corrections
 * -> technical listening -> mixing -> final review split -> distribution, plus permission checks
 * and reports (missed errors, BR-11..13).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client, prepareDatabase, sleep, sql, startServer, stopServer } from './helpers.js';

const u = {
  admin: new Client('admin@mushafs.local'),
  supervisor: new Client('supervisor@mushafs.local'),
  manager: new Client('manager@mushafs.local'),
  mujiz: new Client('mujiz@mushafs.local'),
  tech: new Client('tech@mushafs.local'),
  reader: new Client('reader@mushafs.local'),
  r1: new Client('reviewer1@mushafs.local'),
  r2: new Client('reviewer2@mushafs.local'),
  r3: new Client('reviewer3@mushafs.local'),
  mixing: new Client('mixing@mushafs.local'),
};
const ids: Record<string, number> = {};

async function userId(email: string) {
  return (await sql('SELECT id FROM users WHERE email = $1', [email]))[0].id as number;
}

async function session(projectId: number, number: number) {
  return (await sql('SELECT * FROM sessions WHERE project_id = $1 AND number = $2', [projectId, number]))[0];
}

async function noteTypeId(code: string) {
  return (await sql('SELECT id FROM note_types WHERE code = $1', [code]))[0].id as number;
}

before(async () => {
  await prepareDatabase();
  await startServer();
  for (const c of Object.values(u)) await c.login();
  for (const [k, c] of Object.entries(u)) ids[k] = await userId(c.email);
});

after(async () => {
  await stopServer();
});

describe('authentication', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    const anon = new Client('admin@mushafs.local');
    const bad = await anon.req('POST', '/api/auth/login', { email: 'admin@mushafs.local', password: 'wrong-password' });
    assert.equal(bad.status, 401);
    assert.equal((await anon.get('/api/projects')).status, 401);
  });

  it('validates request bodies', async () => {
    const r = await u.manager.post('/api/projects', { title: '', project_type: 'mushaf' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'validation_failed');
  });

  it('blocks cross-origin state changes', async () => {
    const r = await u.manager.req('POST', '/api/projects', {}, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  });
});

describe('mushaf template (PRJ-02)', () => {
  it('creates 60 hizb sessions on approval, hidden from team before approval', async () => {
    const created = await u.manager.post('/api/projects', {
      title: 'مصحف تجريبي', project_type: 'mushaf', riwayah: 'حفص عن عاصم', reader_id: ids.reader, recording_weekdays: [0, 1, 2, 3],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const pid = created.body.project.id;
    // assign the mujiz before approval: they must not see it yet
    assert.equal((await u.manager.post(`/api/projects/${pid}/team`, { team_role: 'mujiz', user_id: ids.mujiz })).status, 201);
    assert.equal((await u.mujiz.get(`/api/projects/${pid}`)).status, 403);
    assert.equal((await u.manager.post(`/api/projects/${pid}/approve`)).status, 403, 'only center management approves');
    assert.equal((await u.admin.post(`/api/projects/${pid}/approve`)).status, 200);
    assert.equal((await u.mujiz.get(`/api/projects/${pid}`)).status, 200);
    const sessions = await u.manager.get(`/api/projects/${pid}/sessions`);
    assert.equal(sessions.body.sessions.length, 60);
    const s1 = sessions.body.sessions[0];
    assert.deepEqual([s1.start_surah, s1.start_ayah, s1.end_surah, s1.end_ayah], [1, 1, 2, 74]);
    const s60 = sessions.body.sessions[59];
    assert.deepEqual([s60.start_surah, s60.start_ayah, s60.end_surah, s60.end_ayah], [87, 1, 114, 6]);
    // BR-01: cannot start with incomplete team
    const start = await u.manager.post(`/api/projects/${pid}/start`);
    assert.equal(start.status, 400);
    assert.equal(start.body.error.code, 'team_incomplete');
    // REV-04: ayah outside the hizb range is rejected (checked later via note on a recitation project)
  });
});

describe('full production workflow (section 8)', () => {
  let pid: number;

  it('creates, approves and starts a 2-session project with a full team', async () => {
    const created = await u.manager.post('/api/projects', {
      title: 'تلاوات اختبار', project_type: 'recitation', riwayah: 'حفص', reader_id: ids.reader,
      session_count: 2, recording_weekdays: [0, 1, 2, 3, 4, 5, 6], sessions_per_day: 2,
    });
    assert.equal(created.status, 201);
    pid = created.body.project.id;
    assert.equal((await u.admin.post(`/api/projects/${pid}/approve`)).status, 200);
    for (const [role, who] of [['mujiz', 'mujiz'], ['technician', 'tech'], ['reviewer1', 'r1'], ['reviewer2', 'r2']] as const) {
      const r = await u.manager.post(`/api/projects/${pid}/team`, { team_role: role, user_id: ids[who] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    // a reviewer cannot sit in the mujiz seat
    assert.equal((await u.manager.post(`/api/projects/${pid}/team`, { team_role: 'mujiz', user_id: ids.r1 })).status, 400);
    assert.equal((await u.manager.post(`/api/projects/${pid}/start`)).status, 200);
    const notifs = await u.mixing.get('/api/notifications');
    assert.ok(notifs.body.notifications.some((n: any) => n.kind === 'project_started_quality'), 'MIX-01 mixing lead notified');
  });

  it('enforces check-in order reader -> mujiz -> technician (ATT-02/03)', async () => {
    const today = await u.reader.get(`/api/projects/${pid}/today`);
    assert.equal(today.body.next.number, 1);
    assert.equal(today.body.can_check_in.reader, true);
    assert.equal((await u.mujiz.post(`/api/projects/${pid}/checkin`, { role: 'mujiz' })).status, 409);
    assert.equal((await u.reader.post(`/api/projects/${pid}/checkin`, { role: 'reader' })).status, 201);
    assert.equal((await u.tech.post(`/api/projects/${pid}/checkin`, { role: 'technician', outcome: 'full' })).status, 409);
    assert.equal((await u.r1.post(`/api/projects/${pid}/checkin`, { role: 'mujiz' })).status, 403);
    assert.equal((await u.mujiz.post(`/api/projects/${pid}/checkin`, { role: 'mujiz' })).status, 201);
    const t = await u.tech.post(`/api/projects/${pid}/checkin`, { role: 'technician', outcome: 'two_sessions' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal(t.body.recorded_sessions.length, 2);
    assert.equal((await session(pid, 1)).stage, 'editing');
    const timers = await sql("SELECT * FROM stage_timers WHERE project_id = $1 AND stage = 'editing'", [pid]);
    assert.equal(timers.length, 2, 'editing timers started (ATT-03)');
  });

  it('records excuses for a date range (ATT-05)', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10);
    const r = await u.reader.post(`/api/projects/${pid}/excuses`, { date_from: tomorrow, date_to: tomorrow, reason: 'سفر' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await u.r1.post(`/api/projects/${pid}/excuses`, { date_from: tomorrow, date_to: tomorrow, reason: 'x' })).status, 403);
    const log = await u.manager.get(`/api/attendance?project_id=${pid}`);
    assert.equal(log.body.sittings.length, 1);
    assert.equal(log.body.excuses.length, 1);
  });

  it('technician upload creates a version and routes to the first reviewer (FIL-01..03, REV-01)', async () => {
    const s1 = await session(pid, 1);
    const s2 = await session(pid, 2);
    // MIX-02: auto-pick a random quality sample once 2 sessions are uploaded
    assert.equal((await u.admin.put('/api/settings', { random_quality_after_session: 2 })).status, 200);
    assert.equal((await u.r1.upload(s1.id, 'raw')).status, 403);
    const mp3 = await u.tech.upload(s1.id, 'raw', 1, 'x.mp3');
    assert.equal(mp3.status, 400, 'raw upload must be WAV');
    const up1 = await u.tech.upload(s1.id, 'raw');
    assert.equal(up1.status, 201, JSON.stringify(up1.body));
    assert.equal((await u.tech.upload(s2.id, 'raw')).status, 201);
    const after1 = await session(pid, 1);
    assert.equal(after1.stage, 'in_review');
    const work = await u.r1.get('/api/me/work');
    assert.equal(work.body.reviews.length, 2);
    assert.ok(work.body.reviews.every((r: any) => r.unread), 'unread marker');
    const q = await sql("SELECT * FROM quality_ratings WHERE project_id = $1 AND kind = 'first'", [pid]);
    assert.equal(q[0].session_id, s1.id, 'first session goes to the mixing lead for a quality check');
    const random = await sql("SELECT * FROM quality_ratings WHERE project_id = $1 AND kind = 'random'", [pid]);
    assert.equal(random.length, 1, 'random sample picked automatically');
    assert.notEqual(random[0].session_id, s1.id, 'random sample is a session not already sampled');
    // light copy (FIL-02) is produced asynchronously by ffmpeg
    for (let i = 0; i < 40; i++) {
      const v = await sql('SELECT light_status FROM versions WHERE id = $1', [up1.body.version.id]);
      if (v[0].light_status !== 'pending') break;
      await sleep(250);
    }
    const v = await sql('SELECT light_status, duration_sec FROM versions WHERE id = $1', [up1.body.version.id]);
    assert.equal(v[0].light_status, 'ready');
    assert.ok(Math.abs(Number(v[0].duration_sec) - 2) < 0.2);
    const ranged = await u.r1.get(`/api/versions/${up1.body.version.id}/stream`, { range: 'bytes=0-99' });
    assert.equal(ranged.status, 206, 'range requests for smooth scrubbing');
  });

  it('first review: typed notes, technical notes to technician, submit (REV-03..06, DEC-04)', async () => {
    const s1 = await session(pid, 1);
    const detail = await u.r1.get(`/api/sessions/${s1.id}`);
    assert.equal(detail.body.can.review, true);
    const roundId = detail.body.current_round.id;
    const lahn = await u.r1.post(`/api/rounds/${roundId}/notes`, { note_type_id: await noteTypeId('lahn_jali'), surah: 2, ayah: 5, timestamp_sec: 1.2, body: 'لحن في الكلمة' });
    assert.equal(lahn.status, 201, JSON.stringify(lahn.body));
    const tech = await u.r1.post(`/api/rounds/${roundId}/notes`, { note_type_id: await noteTypeId('technical'), surah: 2, ayah: 6, timestamp_sec: 1.5, body: 'ضجيج' });
    assert.equal(tech.status, 201);
    const bad = await u.r1.post(`/api/rounds/${roundId}/notes`, { note_type_id: await noteTypeId('tajweed'), surah: 1, ayah: 9, timestamp_sec: 1, body: 'x' });
    assert.equal(bad.status, 400, 'ayah must exist');
    assert.equal((await u.r2.post(`/api/rounds/${roundId}/notes`, { note_type_id: 1, surah: 2, ayah: 5, timestamp_sec: 1, body: 'x' })).status, 403);
    const sub = await u.r1.post(`/api/rounds/${roundId}/submit`);
    assert.equal(sub.status, 200);
    assert.equal(sub.body.result, 'notes');
    const after = await session(pid, 1);
    assert.equal(after.stage, 'in_decision');
    const techNote = (await sql('SELECT * FROM notes WHERE id = $1', [tech.body.note.id]))[0];
    assert.equal(techNote.routed_to_technician, true);
    assert.equal((await u.r1.post(`/api/rounds/${roundId}/submit`)).status, 409);
  });

  it('session with no notes waits for a one-click pass (DEC-06)', async () => {
    const s2 = await session(pid, 2);
    const r = await u.r1.post(`/api/rounds/${s2.current_round_id}/submit`);
    assert.equal(r.body.result, 'no_notes');
    assert.equal((await session(pid, 2)).stage, 'awaiting_pass');
    assert.equal((await u.r2.post(`/api/sessions/${s2.id}/pass`)).status, 403);
    assert.equal((await u.tech.post(`/api/sessions/${s2.id}/pass`)).status, 200);
    const after = await session(pid, 2);
    assert.equal(after.stage, 'in_review');
    const round = (await sql('SELECT * FROM review_rounds WHERE id = $1', [after.current_round_id]))[0];
    assert.equal(round.round_type, 'second');
    assert.equal(round.reviewer_id, ids.r2);
  });

  it('only the main mujiz decides; accepted notes become corrections (BR-08, DEC-02/03/05)', async () => {
    const s1 = await session(pid, 1);
    const notes = await sql("SELECT * FROM notes WHERE session_id = $1 AND NOT routed_to_technician", [s1.id]);
    assert.equal((await u.r1.post(`/api/notes/${notes[0].id}/decision`, { decision: 'accept' })).status, 403);
    const studio = await u.mujiz.post(`/api/notes/${notes[0].id}/decision`, { decision: 'studio' });
    assert.equal(studio.body.remaining, 1, '"listen in studio" keeps the note open');
    const acc = await u.mujiz.post(`/api/notes/${notes[0].id}/decision`, { decision: 'accept', comment: 'يعاد' });
    assert.equal(acc.status, 200);
    assert.equal(acc.body.remaining, 0);
    assert.equal((await session(pid, 1)).stage, 'in_corrections');
    const hist = await sql('SELECT * FROM note_decisions WHERE note_id = $1 ORDER BY id', [notes[0].id]);
    assert.deepEqual(hist.map((h: any) => h.decision), ['studio', 'accept'], 'decision history kept');
    const techNotifs = await u.tech.get('/api/notifications');
    assert.ok(techNotifs.body.notifications.some((n: any) => n.kind === 'corrections_required'));
  });

  it('technician marks a re-recording and uploads the corrected version (FIL-03, BR-12)', async () => {
    const s1 = await session(pid, 1);
    const corrections = await sql('SELECT * FROM corrections WHERE session_id = $1 ORDER BY id', [s1.id]);
    assert.equal(corrections.length, 2);
    const lahnCorr = corrections.find((c: any) => c.ayah_from === 5)!;
    assert.equal((await u.tech.patch(`/api/corrections/${lahnCorr.id}`, { is_rerecord: true, ayah_from: 5, ayah_to: 5 })).status, 200);
    const up = await u.tech.upload(s1.id, 'raw', 2, 'corrected.wav');
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.version.version_no, 2);
    const versions = await sql("SELECT version_no, is_approved FROM versions WHERE session_id = $1 AND kind = 'raw' ORDER BY version_no", [s1.id]);
    assert.deepEqual(versions.map((v: any) => [v.version_no, v.is_approved]), [[1, false], [2, true]], 'one approved version, earlier kept');
    const after = await session(pid, 1);
    assert.equal(after.stage, 'in_review');
    const round = (await sql('SELECT * FROM review_rounds WHERE id = $1', [after.current_round_id]))[0];
    assert.equal(round.round_type, 'second');
    const done = await sql("SELECT status FROM corrections WHERE session_id = $1", [s1.id]);
    assert.ok(done.every((c: any) => c.status === 'done'));
    assert.equal((await u.mujiz.post(`/api/corrections/${lahnCorr.id}/verify`)).status, 200);
  });

  it('second review catches an error the first reviewer missed (BR-11)', async () => {
    const s1 = await session(pid, 1);
    const n = await u.r2.post(`/api/rounds/${s1.current_round_id}/notes`, { note_type_id: await noteTypeId('lahn_jali'), surah: 3, ayah: 10, timestamp_sec: 0.4, body: 'لحن لم يُلاحظ' });
    assert.equal(n.status, 201);
    // a note the mujiz will reject: not an error (BR-13)
    const n2 = await u.r2.post(`/api/rounds/${s1.current_round_id}/notes`, { note_type_id: await noteTypeId('tajweed'), surah: 3, ayah: 11, timestamp_sec: 0.8, body: 'مد' });
    await u.r2.post(`/api/rounds/${s1.current_round_id}/submit`);
    await u.mujiz.post(`/api/notes/${n.body.note.id}/decision`, { decision: 'accept' });
    await u.mujiz.post(`/api/notes/${n2.body.note.id}/decision`, { decision: 'reject' });
    assert.equal((await session(pid, 1)).stage, 'in_corrections');
    assert.equal((await u.tech.upload(s1.id, 'raw')).status, 201);
    const after = await session(pid, 1);
    const round = (await sql('SELECT * FROM review_rounds WHERE id = $1', [after.current_round_id]))[0];
    assert.equal(round.round_type, 'technical');
    assert.equal(round.reviewer_id, ids.tech, 'final technical listening by the technician');
  });

  it('technical listening passes both sessions to "raw and ready for mixing"; project moves to mixing (BR-10)', async () => {
    const s1 = await session(pid, 1);
    await u.tech.post(`/api/rounds/${s1.current_round_id}/submit`);
    await u.tech.post(`/api/sessions/${s1.id}/pass`);
    assert.equal((await session(pid, 1)).stage, 'ready_for_mixing');
    let p = (await sql('SELECT status FROM projects WHERE id = $1', [pid]))[0];
    assert.equal(p.status, 'recording');
    // mixing lead cannot upload mixed before every session is ready
    assert.equal((await u.mixing.upload(s1.id, 'mixed')).status, 409);
    const s2 = await session(pid, 2);
    await u.r2.post(`/api/rounds/${s2.current_round_id}/submit`);
    await u.tech.post(`/api/sessions/${s2.id}/pass`);
    const s2b = await session(pid, 2);
    await u.tech.post(`/api/rounds/${s2b.current_round_id}/submit`);
    await u.tech.post(`/api/sessions/${s2.id}/pass`);
    assert.equal((await session(pid, 2)).stage, 'ready_for_mixing');
    p = (await sql('SELECT status FROM projects WHERE id = $1', [pid]))[0];
    assert.equal(p.status, 'mixing');
  });

  it('mixing lead rates the quality sample and uploads mixed files (MIX-03/04)', async () => {
    const q = await u.mixing.get(`/api/projects/${pid}/quality`);
    const first = q.body.ratings[0];
    assert.equal((await u.mixing.post(`/api/quality/${first.id}/rate`, { verdict: 'not_suitable' })).status, 400, 'notes required');
    assert.equal(first.kind, 'first');
    assert.equal((await u.mixing.post(`/api/quality/${first.id}/rate`, { verdict: 'approved' })).status, 200);
    const random = q.body.ratings.find((r: any) => r.kind === 'random');
    const rated = await u.mixing.post(`/api/quality/${random.id}/rate`, { verdict: 'not_suitable', notes: 'ضجيج في الخلفية' });
    assert.equal(rated.status, 200);
    const zip = await u.mixing.get(`/api/projects/${pid}/raw-archive`);
    assert.equal(zip.status, 200);
    assert.ok((zip.body as ArrayBuffer).byteLength > 1000);
    for (const n of [1, 2]) {
      const s = await session(pid, n);
      const r = await u.mixing.upload(s.id, 'mixed', 2, 'mixed.wav');
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    assert.equal((await session(pid, 1)).stage, 'mixed');
  });

  it('final review split must cover every session (REV-08)', async () => {
    const gap = await u.manager.post(`/api/projects/${pid}/final-review`, { split: 'half', parts: [{ reviewer_id: ids.r3, from: 1, to: 1 }] });
    assert.equal(gap.status, 400);
    const ok = await u.manager.post(`/api/projects/${pid}/final-review`, { split: 'whole', parts: [{ reviewer_id: ids.r3, from: 1, to: 2 }] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal((await sql('SELECT status FROM projects WHERE id = $1', [pid]))[0].status, 'final_review');
  });

  it('final notes go to the production manager, then the mujiz; corrections replace in place (FIL-06)', async () => {
    const s1 = await session(pid, 1);
    const n = await u.r3.post(`/api/rounds/${s1.current_round_id}/notes`, { note_type_id: await noteTypeId('performance'), surah: 4, ayah: 1, timestamp_sec: 1, body: 'تعديل' });
    assert.equal(n.status, 201);
    await u.r3.post(`/api/rounds/${s1.current_round_id}/submit`);
    assert.equal((await session(pid, 1)).stage, 'pm_forward');
    assert.equal((await u.mujiz.post(`/api/notes/${n.body.note.id}/decision`, { decision: 'accept' })).status, 409, 'not yet forwarded');
    assert.equal((await u.manager.post(`/api/sessions/${s1.id}/forward-notes`)).status, 200);
    assert.equal((await u.mujiz.post(`/api/notes/${n.body.note.id}/decision`, { decision: 'accept' })).status, 200);
    assert.equal((await session(pid, 1)).stage, 'in_corrections');
    assert.equal((await u.mixing.upload(s1.id, 'mixed', 2, 'fixed.wav')).status, 201);
    assert.equal((await session(pid, 1)).stage, 'done');
    const mixed = await sql("SELECT version_no, is_approved FROM versions WHERE session_id = $1 AND kind = 'mixed' ORDER BY version_no", [s1.id]);
    assert.equal(mixed.length, 2);
    assert.equal(mixed[1].is_approved, true);

    const s2 = await session(pid, 2);
    await u.r3.post(`/api/rounds/${s2.current_round_id}/submit`);
    await u.tech.post(`/api/sessions/${s2.id}/pass`);
    assert.equal((await session(pid, 2)).stage, 'done');
    assert.equal((await sql('SELECT status FROM projects WHERE id = $1', [pid]))[0].status, 'distribution');
  });

  it('logs distribution and completes the project (DST-01)', async () => {
    const d = await u.manager.post(`/api/projects/${pid}/distributions`, {
      recipient: 'إذاعة القرآن الكريم', channel: 'netia', country: 'SA', city: 'Riyadh', delivered_on: '2026-11-10', output_version: 'by hizb',
    });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    assert.equal((await u.reader.post(`/api/projects/${pid}/distributions`, { recipient: 'x', channel: 'direct', delivered_on: '2026-11-10' })).status, 403);
    assert.equal((await u.manager.post(`/api/projects/${pid}/complete`)).status, 200);
    const journey = await u.reader.get(`/api/projects/${pid}/journey`);
    assert.ok(journey.body.steps.find((s: any) => s.key === 'first_broadcast').at);
  });

  it('reports count missed errors against the earlier reviewer and rejected notes separately (BR-11/13)', async () => {
    const rq = await u.supervisor.get(`/api/reports/review-quality?project_id=${pid}`);
    assert.equal(rq.status, 200);
    const r1 = rq.body.data.find((r: any) => r.id === ids.r1);
    const r2 = rq.body.data.find((r: any) => r.id === ids.r2);
    // round-2 lahn jali (3:10) + final-review note (4:1) were both found after reviewer 1's round
    assert.equal(r1.missed, 2, 'reviewer 1 is charged for errors found in later rounds');
    assert.equal(r1.missed_clear, 1);
    assert.equal(r2.missed, 1, 'reviewer 2 is charged for the final-review finding');
    assert.equal(r2.rejected, 1);
    assert.equal(r2.caught, 1);
    const ce = await u.supervisor.get(`/api/reports/clear-errors?project_id=${pid}`);
    assert.equal(ce.body.data.byProject[0].clear_errors, 2);
    for (const name of ['production-status', 'stage-times', 'recording-commitment', 'reader-quality', 'recording-quality', 'speed-vs-quality', 'workload', 'annual-output', 'distribution-reach']) {
      const r = await u.manager.get(`/api/reports/${name}`);
      assert.equal(r.status, 200, `${name}: ${JSON.stringify(r.body)}`);
    }
    assert.equal((await u.r1.get('/api/reports/workload')).status, 403);
  });

  it('dashboard: detailed view for management, general view hides staff and performance', async () => {
    const det = await u.supervisor.get('/api/dashboard?view=detailed');
    assert.equal(det.body.view, 'detailed');
    const proj = det.body.projects.find((p: any) => p.id === pid);
    assert.ok(proj.rings && proj.health);
    const gen = await u.r1.get('/api/dashboard?view=detailed');
    assert.equal(gen.body.view, 'general', 'non-management gets the general view');
    const g = gen.body.projects.find((p: any) => p.id === pid);
    assert.equal(g.rings, undefined);
    assert.equal(g.reader_name, undefined);
  });
});

describe('personal data & audit (RDR-01, ADM-03)', () => {
  it('encrypts ID/IBAN and restricts access to owner and admin', async () => {
    const put = await u.reader.put('/api/auth/private/me', { national_id: '1012345678', iban: 'SA03 8000 0000 6080 1016 7519' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const raw = await sql('SELECT iban_enc FROM user_private_data WHERE user_id = $1', [ids.reader]);
    assert.ok(!raw[0].iban_enc.includes('SA03'), 'stored encrypted');
    const mine = await u.reader.get('/api/auth/private/me');
    assert.match(mine.body.iban, /\*+7519$/);
    assert.equal((await u.r1.get(`/api/auth/private/${ids.reader}`)).status, 403);
    const adm = await u.admin.get(`/api/auth/private/${ids.reader}?reveal=true`);
    assert.equal(adm.body.iban, 'SA0380000000608010167519');
    const audit = await u.admin.get('/api/audit?entity=user');
    assert.ok(audit.body.entries.some((e: any) => e.action === 'personal_data_viewed'));
  });

  it('settings are editable by center management only (ADM-02)', async () => {
    assert.equal((await u.manager.put('/api/settings', { review_hours: 24 })).status, 403);
    const r = await u.admin.put('/api/settings', { review_hours: 24, auto_pass_no_notes: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.review_hours, 24);
    assert.equal((await u.admin.put('/api/settings', { review_hours: -1 })).status, 400);
  });
});

describe('timers and escalation (TMR-02)', () => {
  it('raises orange, red and PM-red levels with notifications', async () => {
    const { evaluateTimers } = await import('../src/services/timers.service.js');
    const p = (await sql("SELECT id FROM projects WHERE project_type = 'mushaf' LIMIT 1"))[0];
    const [t] = await sql(
      `INSERT INTO stage_timers (project_id, stage, assignee_id, allowed_hours, orange_grace_hours, pm_grace_hours, started_at, due_at, red_at, pm_red_at)
       VALUES ($1, 'review', $2, 48, 48, 48, now() - interval '10 days', now() - interval '5 days', now() - interval '3 days', now() - interval '1 day') RETURNING id`,
      [p.id, ids.r1],
    );
    await evaluateTimers();
    const row = (await sql('SELECT alert_level FROM stage_timers WHERE id = $1', [t.id]))[0];
    assert.equal(row.alert_level, 3);
    const sup = await u.supervisor.get('/api/notifications');
    assert.ok(sup.body.notifications.some((n: any) => n.kind === 'escalation_supervisor'));
    const pm = await u.manager.get('/api/notifications');
    assert.ok(pm.body.notifications.some((n: any) => n.kind.startsWith('escalation_pm')));
  });
});
