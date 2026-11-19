import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AudioPlayer, type PlayerHandle } from '../components/AudioPlayer';
import { AlertDot, Async, ConfirmModal, DualDate, Empty, ErrorBox, Field, Modal, StageBadge, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { rangeText } from '../components/TodayCard';
import { useI18n } from '../i18n';
import { api, downloadUrl, streamUrl } from '../lib/api';
import { bytes, clock, dual, relative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useNotifications } from '../lib/notifications';
import { NoteCard, NoteForm, UploadBox, type NoteDraft } from './session/parts';

export function SessionPage() {
  const { id } = useParams();
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const { tick } = useNotifications();
  const state = useApi<any>(`/sessions/${id}`, [tick]);
  const noteTypes = useApi<any>('/note-types');
  const player = useRef<PlayerHandle>(null);
  const [versionId, setVersionId] = useState<number | null>(null);
  const [original, setOriginal] = useState(false);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [editing, setEditing] = useState<NoteDraft | null>(null);
  const [confirm, setConfirm] = useState<null | 'submit' | 'pass' | 'forward'>(null);
  const [busy, setBusy] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);

  const d = state.data;
  // Default player version: the version the current round reviews, else the latest approved (mixed > raw)
  useEffect(() => {
    if (!d || versionId) return;
    const approved = d.versions.filter((v: any) => v.is_approved);
    const v = d.current_round?.version_id ?? (approved.find((x: any) => x.kind === 'mixed') ?? approved[0])?.id ?? null;
    setVersionId(v);
  }, [d, versionId]);

  useEffect(() => {
    if (pendingSeek !== null) {
      player.current?.playFrom(pendingSeek);
      setPendingSeek(null);
    }
  }, [pendingSeek, versionId]);

  const currentNotes = useMemo(() => (d ? d.notes.filter((n: any) => n.round_id === d.current_round?.id) : []), [d]);
  const markers = useMemo(
    () => (d ? d.notes.filter((n: any) => n.version_id === versionId).map((n: any) => ({ id: n.id, time: Number(n.timestamp_sec), strong: n.is_clear_error })) : []),
    [d, versionId],
  );

  const reload = () => state.reload(true);

  /** DEC-01: tapping a note plays the audio from 10 seconds before it. */
  const playNote = (n: any) => {
    const target = Math.max(0, Number(n.timestamp_sec) - 10);
    if (n.version_id !== versionId) {
      setVersionId(n.version_id);
      setPendingSeek(target);
    } else player.current?.playFrom(target);
  };

  const doAction = async (kind: 'submit' | 'pass' | 'forward') => {
    setBusy(true);
    try {
      if (kind === 'submit') await api.post(`/rounds/${d.current_round.id}/submit`);
      if (kind === 'pass') await api.post(`/sessions/${id}/pass`);
      if (kind === 'forward') await api.post(`/sessions/${id}/forward-notes`);
      toast(t(kind === 'submit' ? 'session.submitted' : kind === 'pass' ? 'session.passed' : 'session.forwarded'));
      setConfirm(null);
      setVersionId(null);
      await state.reload(true);
    } catch (err) {
      toast(errorText(err), 'error');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (noteId: number) => {
    try {
      await api.del(`/notes/${noteId}`);
      reload();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <Async state={state}>
      {(d) => {
        const s = d.session;
        const can = d.can;
        const round = d.current_round;
        const version = d.versions.find((v: any) => v.id === versionId);
        const src = version ? streamUrl(version.id, original) : null;
        const pendingQuality = d.quality.find((q: any) => !q.verdict);
        const rounds = d.rounds as any[];

        return (
          <>
            <div className="page-head">
              <div>
                <div className="crumbs">
                  <Link to="/projects">{t('projects.title')}</Link> / <Link to={`/projects/${s.project_id}?tab=sessions`}>{s.project_title}</Link>
                </div>
                <h1>{t('session.title', { n: s.number })} <span className="muted" style={{ fontSize: '1rem' }}>/ {s.session_count}</span></h1>
                <div className="row" style={{ marginTop: 4 }}>
                  <StageBadge stage={s.stage} />
                  {round && round.status === 'open' && <span className="badge badge-info">{t(`round.${round.round_type}`)} · {round.reviewer_name ?? rounds.find((r) => r.id === round.id)?.reviewer_name}</span>}
                  <span className="muted">{rangeText(s, locale)}</span>
                  <span className="faint">· {s.reader_name} · {s.riwayah}</span>
                </div>
              </div>
              <div className="row">
                {can.pass && <button className="btn btn-primary" onClick={() => setConfirm('pass')}><Icon name="arrow" /> {t('session.pass')}</button>}
                {can.forward && <button className="btn btn-primary" onClick={() => setConfirm('forward')}><Icon name="send" /> {t('session.forward')}</button>}
                {can.extra_round && <button className="btn" onClick={() => setExtraOpen(true)}><Icon name="plus" /> {t('session.extra_round')}</button>}
              </div>
            </div>

            {d.timers.length > 0 && (
              <div className="row" style={{ marginBottom: 12 }}>
                {d.timers.map((tm: any, i: number) => (
                  <span key={i} className={`badge ${tm.alert_level === 0 ? 'badge-muted' : tm.alert_level === 1 ? 'badge-orange' : 'badge-red'}`}>
                    <AlertDot level={tm.alert_level} /> {t(`timer_stage.${tm.stage}`)} · {tm.assignee_name ?? '—'} · {t('session.due', { time: relative(tm.due_at, locale) })}
                  </span>
                ))}
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }} data-session-layout>
              <div className="stack">
                {/* Player */}
                {src ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <AudioPlayer ref={player} src={src} markers={markers} onTime={setPlayerTime} onMarkerClick={(nid) => { const n = d.notes.find((x: any) => x.id === nid); if (n) playNote(n); }} />
                    <div className="row" style={{ fontSize: '0.85rem' }}>
                      <select className="input" style={{ maxWidth: 280, minHeight: 32, padding: '4px 8px' }} value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))} aria-label={t('session.versions')}>
                        {d.versions.map((v: any) => (
                          <option key={v.id} value={v.id}>{t(`session.${v.kind}`)} v{v.version_no}{v.is_approved ? ` (${t('session.approved')})` : ''}</option>
                        ))}
                      </select>
                      <label className="checkbox"><input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} /> {t('player.original')}</label>
                      {version?.light_status === 'pending' && <span className="faint">{t('session.light_pending')}</span>}
                      {version?.light_status === 'failed' && <span className="faint">{t('session.light_failed')}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="card empty">{s.stage === 'editing' ? t('session.awaiting_upload') : t('session.no_version')}</div>
                )}

                {/* Uploads */}
                {can.upload_raw && <UploadBox sessionId={s.id} kind="raw" label={t('session.upload_raw')} onDone={() => { setVersionId(null); reload(); }} />}
                {can.upload_mixed && <UploadBox sessionId={s.id} kind="mixed" label={t('session.upload_mixed')} onDone={() => { setVersionId(null); reload(); }} />}

                {/* Reviewer: write notes for the open round */}
                {can.review && (
                  <section className="card">
                    <div className="card-head">
                      <h2>{t('session.you_review')}: {t(`round.${round.round_type}`)}</h2>
                      <button className="btn btn-primary" onClick={() => setConfirm('submit')}>
                        {currentNotes.length ? t('session.submit_notes', { n: currentNotes.length }) : t('session.submit_no_notes')}
                      </button>
                    </div>
                    {editing ? (
                      <NoteForm key={editing.id} session={s} roundId={round.id} noteTypes={noteTypes.data?.note_types ?? []} now={playerTime}
                        initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
                    ) : (
                      <NoteForm session={s} roundId={round.id} noteTypes={noteTypes.data?.note_types ?? []} now={playerTime} onSaved={reload} />
                    )}
                    <p className="faint" style={{ fontSize: '0.8rem', marginTop: 8 }}>{t('session.general_notes_hint')}</p>
                  </section>
                )}

                {/* Notes of the current round (decisions for the mujiz) */}
                {round && (
                  <section className="card">
                    <div className="card-head"><h2>{t('session.notes')} · {t(`round.${round.round_type}`)}</h2><span className="badge">{currentNotes.length}</span></div>
                    {currentNotes.length ? currentNotes.map((n: any) => (
                      <NoteCard key={n.id} note={n} onPlay={() => playNote(n)} canDecide={can.decide} canEdit={can.review}
                        onEdit={() => setEditing({ id: n.id, note_type_id: String(n.note_type_id), surah: String(n.surah), ayah: String(n.ayah), time: clock(n.timestamp_sec), body: n.body })}
                        onDelete={() => deleteNote(n.id)} onDecided={reload} />
                    )) : <Empty>{t('session.no_notes_yet')}</Empty>}
                  </section>
                )}

                {/* Earlier rounds */}
                {rounds.filter((r) => r.id !== round?.id).length > 0 && (
                  <section className="card">
                    <div className="card-head"><h2>{t('session.rounds')}</h2></div>
                    {rounds.filter((r) => r.id !== round?.id).slice().reverse().map((r) => {
                      const ns = d.notes.filter((n: any) => n.round_id === r.id);
                      return (
                        <details key={r.id} style={{ marginBottom: 10 }}>
                          <summary style={{ cursor: 'pointer' }}>
                            <strong>{t(`round.${r.round_type}`)}</strong> · {r.reviewer_name} · {t(`session.${r.version_kind}`)} v{r.version_no} ·{' '}
                            {r.result === 'no_notes' ? <span className="badge badge-ok">{t('session.no_notes')}</span> : r.status === 'open' ? <span className="badge badge-info">{t('common.open')}</span> : <span className="badge">{t('home.notes_count', { n: r.notes_count })}</span>}
                            <span className="faint"> · {dual(r.submitted_at ?? r.assigned_at, locale, true)}</span>
                          </summary>
                          <div style={{ marginTop: 8 }}>
                            {ns.length ? ns.map((n: any) => <NoteCard key={n.id} note={n} onPlay={() => playNote(n)} canDecide={false} canEdit={false} onEdit={() => undefined} onDelete={() => undefined} onDecided={() => undefined} />) : <span className="faint">—</span>}
                          </div>
                        </details>
                      );
                    })}
                  </section>
                )}
              </div>

              <div className="stack">
                {pendingQuality && can.rate_quality && <QualityPanel rating={pendingQuality} onDone={reload} />}
                <CorrectionsPanel d={d} onChanged={reload} />
                <section className="card">
                  <div className="card-head"><h2>{t('session.versions')}</h2></div>
                  {d.versions.length ? (
                    <div className="stack" style={{ gap: 0 }}>
                      {d.versions.map((v: any) => (
                        <div key={v.id} className="work-item" style={{ cursor: 'default' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="title">{t(`session.${v.kind}`)} v{v.version_no} {v.is_approved && <span className="badge badge-ok">{t('session.approved')}</span>}</div>
                            <div className="meta">{v.uploaded_by_name} · {dual(v.uploaded_at, locale, true)} · {bytes(v.size_bytes)}{v.duration_sec ? ` · ${clock(v.duration_sec)}` : ''}</div>
                          </div>
                          <button className="icon-btn" title={t('player.play')} onClick={() => setVersionId(v.id)}><Icon name="play" /></button>
                          <a className="icon-btn" title={t('common.download')} href={downloadUrl(v.id)}><Icon name="download" /></a>
                        </div>
                      ))}
                    </div>
                  ) : <Empty />}
                </section>
                <section className="card">
                  <div className="card-head"><h2>{t('session.history')}</h2></div>
                  <ul className="timeline">
                    {d.events.slice().reverse().map((e: any) => (
                      <li key={e.id} className="done">
                        <div className="t-title"><StageBadge stage={e.to_stage} /></div>
                        <div className="t-meta">{e.actor_name ?? '—'} · {dual(e.created_at, locale, true)}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>

            {confirm && (
              <ConfirmModal
                message={confirm === 'submit' ? t('session.confirm_submit') : confirm === 'pass' ? t('session.pass') : t('session.forward')}
                busy={busy}
                onClose={() => setConfirm(null)}
                onConfirm={() => doAction(confirm)}
              />
            )}
            {extraOpen && <ExtraRoundModal sessionId={s.id} onClose={() => setExtraOpen(false)} onDone={() => { setExtraOpen(false); setVersionId(null); reload(); }} />}
          </>
        );
      }}
    </Async>
  );
}

/** DEC-05 / BR-12: corrections with status; technician marks re-recordings; mujiz verifies. */
function CorrectionsPanel({ d, onChanged }: { d: any; onChanged: () => void }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  if (!d.corrections.length) return null;

  const verify = async (cid: number) => {
    try {
      await api.post(`/corrections/${cid}/verify`);
      onChanged();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <section className="card">
      <div className="card-head"><h2>{t('session.corrections')}</h2></div>
      {d.session.stage === 'in_corrections' && d.can.edit_corrections && <div className="alert-box info" style={{ marginBottom: 10 }}>{t('session.open_corrections_hint')}</div>}
      {d.corrections.map((c: any) => (
        <div key={c.id} className="note">
          <div className="note-head">
            <span className={`badge ${c.status === 'open' ? 'badge-gold' : c.status === 'done' ? 'badge-info' : 'badge-ok'}`}>{t(`correction_status.${c.status}`)}</span>
            <span className="num">{clock(c.timestamp_sec)}</span>
            <span>{t('session.ayah')} <span className="num">{c.ayah_from}{c.ayah_to !== c.ayah_from ? `–${c.ayah_to}` : ''}</span></span>
            {c.is_rerecord && <span className="badge badge-muted">{t('session.rerecord')}</span>}
          </div>
          <div style={{ fontSize: '0.9rem' }}>{c.note_body}</div>
          {c.done_at && <div className="faint" style={{ fontSize: '0.8rem' }}>{c.done_by_name} · {dual(c.done_at, locale, true)}</div>}
          {c.verified_at && <div className="faint" style={{ fontSize: '0.8rem' }}>✓ {c.verified_by_name} · {dual(c.verified_at, locale, true)}</div>}
          <div className="row" style={{ marginTop: 6 }}>
            {d.can.edit_corrections && c.status === 'open' && <button className="btn btn-sm" onClick={() => setEdit({ ...c })}>{t('common.edit')}</button>}
            {d.can.verify_corrections && c.status === 'done' && <button className="btn btn-sm" onClick={() => verify(c.id)}>{t('session.verify')}</button>}
          </div>
        </div>
      ))}
      {edit && (
        <Modal title={t('session.corrections')} onClose={() => setEdit(null)} footer={
          <>
            <button className="btn" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={async () => {
              try {
                await api.patch(`/corrections/${edit.id}`, { is_rerecord: edit.is_rerecord, ayah_from: Number(edit.ayah_from), ayah_to: Number(edit.ayah_to) });
                setEdit(null);
                onChanged();
              } catch (err) {
                toast(errorText(err), 'error');
              }
            }}>{t('common.save')}</button>
          </>
        }>
          <div className="form-grid">
            <label className="checkbox full"><input type="checkbox" checked={edit.is_rerecord} onChange={(e) => setEdit({ ...edit, is_rerecord: e.target.checked })} /> {t('session.rerecord')}</label>
            <Field label={t('session.ayah_from')}><input className="input" type="number" min={1} value={edit.ayah_from} onChange={(e) => setEdit({ ...edit, ayah_from: e.target.value })} /></Field>
            <Field label={t('session.ayah_to')}><input className="input" type="number" min={1} value={edit.ayah_to} onChange={(e) => setEdit({ ...edit, ayah_to: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** MIX-03: approve with a tick, or "not suitable" with notes. */
function QualityPanel({ rating, onDone }: { rating: any; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const rate = async (verdict: 'approved' | 'not_suitable') => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/quality/${rating.id}/rate`, { verdict, notes: notes || null });
      toast(t('common.saved'));
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card" style={{ borderColor: 'var(--gold)' }}>
      <div className="card-head"><h2>{t('session.quality')}</h2><span className="badge badge-gold">{t(`quality.${rating.kind}`)}</span></div>
      <p className="faint" style={{ fontSize: '0.8rem' }}><DualDate value={rating.requested_at} /></p>
      <Field label={t('session.quality_notes')}><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div style={{ marginTop: 8 }}><ErrorBox error={error} /></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => rate('approved')}>{t('session.approve_quality')}</button>
        <button className="btn btn-danger" disabled={busy || !notes.trim()} onClick={() => rate('not_suitable')}>{t('session.not_suitable')}</button>
      </div>
    </section>
  );
}

/** REV-07: extra review round on demand. */
function ExtraRoundModal({ sessionId, onClose, onDone }: { sessionId: number; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const users = useApi<any>('/users?role=reviewer&active=true');
  const [reviewer, setReviewer] = useState('');
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    try {
      await api.post(`/sessions/${sessionId}/extra-round`, { reviewer_id: Number(reviewer) });
      onDone();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title={t('session.extra_round')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!reviewer} onClick={submit}>{t('common.confirm')}</button></>}>
      <Field label={t('project.reviewer')}>
        <select className="input" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
          <option value="">—</option>
          {(users.data?.users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </Field>
      <div style={{ marginTop: 10 }}><ErrorBox error={error} /></div>
    </Modal>
  );
}
