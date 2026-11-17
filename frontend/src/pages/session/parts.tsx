import { useMemo, useState } from 'react';
import { ErrorBox, Field, fieldErrors, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { api, uploadWithProgress } from '../../lib/api';
import { clock, dual, parseClock } from '../../lib/format';
import { useSurahs, type Surah } from '../../lib/hooks';

/** REV-04: ayah list limited to the session's range (whole Quran when the session has no range). */
export function useAyahChoices(session: any) {
  const surahs = useSurahs();
  return useMemo(() => {
    if (!surahs.length) return [] as { surah: Surah; from: number; to: number }[];
    if (!session.start_surah) return surahs.map((s) => ({ surah: s, from: 1, to: s.ayah_count }));
    const out = [];
    for (let n = session.start_surah; n <= session.end_surah; n++) {
      const s = surahs[n - 1];
      out.push({ surah: s, from: n === session.start_surah ? session.start_ayah : 1, to: n === session.end_surah ? session.end_ayah : s.ayah_count });
    }
    return out;
  }, [surahs, session.start_surah, session.start_ayah, session.end_surah, session.end_ayah]);
}

export interface NoteDraft { id?: number; note_type_id: string; surah: string; ayah: string; time: string; body: string }

/** REV-03: place a marker at the current second (or type the time) and write the note under it. */
export function NoteForm({ session, noteTypes, now, initial, onSaved, onCancel, roundId }: {
  session: any; noteTypes: any[]; now: number; initial?: NoteDraft; roundId: number; onSaved: () => void; onCancel?: () => void;
}) {
  const { t, locale } = useI18n();
  const choices = useAyahChoices(session);
  const [d, setD] = useState<NoteDraft>(initial ?? { note_type_id: '', surah: String(session.start_surah ?? ''), ayah: String(session.start_ayah ?? ''), time: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const errs = fieldErrors(error);
  const current = choices.find((c) => String(c.surah.number) === d.surah);
  const timeValue = parseClock(d.time);

  const save = async () => {
    if (timeValue === null) { setError({ details: [{ path: 'timestamp_sec', message: t('session.invalid_time') }] }); return; }
    setBusy(true);
    setError(null);
    const body = { note_type_id: Number(d.note_type_id), surah: Number(d.surah), ayah: Number(d.ayah), timestamp_sec: timeValue, body: d.body };
    try {
      if (d.id) await api.patch(`/notes/${d.id}`, body);
      else await api.post(`/rounds/${roundId}/notes`, body);
      if (!d.id) setD((x) => ({ ...x, body: '', time: '' }));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <button type="button" className="btn btn-gold" onClick={() => setD((x) => ({ ...x, time: clock(now) }))}>
          <Icon name="flag" /> {t('session.marker_here', { time: clock(now) })}
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>{t('session.manual_time')}</span>
      </div>
      <div className="form-grid">
        <Field label={t('session.timestamp')} error={errs.timestamp_sec}>
          <input className={`input num${errs.timestamp_sec ? ' invalid' : ''}`} dir="ltr" placeholder="12:34" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
        </Field>
        <Field label={t('session.type')}>
          <select className="input" value={d.note_type_id} onChange={(e) => setD({ ...d, note_type_id: e.target.value })}>
            <option value="">—</option>
            {noteTypes.map((nt) => <option key={nt.id} value={nt.id}>{locale === 'ar' ? nt.name_ar : nt.name_en}</option>)}
          </select>
        </Field>
        <Field label={t('session.surah')}>
          <select className="input" value={d.surah} onChange={(e) => {
            const c = choices.find((x) => String(x.surah.number) === e.target.value);
            setD({ ...d, surah: e.target.value, ayah: c ? String(c.from) : '' });
          }}>
            <option value="">—</option>
            {choices.map((c) => <option key={c.surah.number} value={c.surah.number}>{c.surah.number}. {locale === 'ar' ? c.surah.name_ar : c.surah.name_en}</option>)}
          </select>
        </Field>
        <Field label={t('session.ayah')} error={errs.ayah}>
          <select className="input" value={d.ayah} onChange={(e) => setD({ ...d, ayah: e.target.value })} disabled={!current}>
            {current && Array.from({ length: current.to - current.from + 1 }, (_, i) => current.from + i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label={t('session.text')} full error={errs.body}>
          <textarea className="input" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} maxLength={4000} />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}><ErrorBox error={error?.code ? error : null} /></div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        {onCancel && <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>}
        <button className="btn btn-primary" disabled={busy || !d.note_type_id || !d.surah || !d.ayah || !d.body.trim() || !d.time} onClick={save}>
          {d.id ? t('common.save') : t('session.add_note')}
        </button>
      </div>
    </div>
  );
}

/** FIL-01: upload with a progress bar. */
export function UploadBox({ sessionId, kind, label, onDone }: { sessionId: number; kind: 'raw' | 'mixed'; label: string; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);
    setPct(0);
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    try {
      await uploadWithProgress(`/sessions/${sessionId}/versions`, fd, setPct);
      toast(t('session.uploaded'));
      setFile(null);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="card" style={{ borderColor: 'var(--navy)' }}>
      <h3><Icon name="upload" /> {label}</h3>
      <div className="row">
        <input type="file" accept={kind === 'raw' ? '.wav,audio/wav' : '.wav,.mp3,.flac,.m4a,.aac,audio/*'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={pct !== null} />
        <button className="btn btn-primary" disabled={!file || pct !== null} onClick={upload}>{t('common.upload')}</button>
      </div>
      {pct !== null && (
        <div style={{ marginTop: 10 }}>
          <div className="progress-bar"><span style={{ width: `${pct}%`, background: 'var(--navy)' }} /></div>
          <div className="muted num" style={{ fontSize: '0.85rem' }}>{t('session.uploading', { pct })}</div>
        </div>
      )}
      <div style={{ marginTop: 8 }}><ErrorBox error={error} /></div>
    </div>
  );
}

/** One note, with decision history and (for the mujiz) the four decisions. */
export function NoteCard({ note, onPlay, canDecide, canEdit, onEdit, onDelete, onDecided }: {
  note: any; onPlay: () => void; canDecide: boolean; canEdit: boolean; onEdit: () => void; onDelete: () => void; onDecided: () => void;
}) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (decision: string) => {
    setBusy(true);
    try {
      await api.post(`/notes/${note.id}/decision`, { decision, comment: comment || null });
      toast(t('session.decided'));
      setComment('');
      onDecided();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`note${note.is_clear_error ? ' lahn' : ''}`}>
      <div className="note-head">
        <button className="note-time" onClick={onPlay} title={t('session.play_from')}>▶ {clock(note.timestamp_sec)}</button>
        <span className={`badge ${note.is_clear_error ? 'badge-red' : note.is_technical ? 'badge-muted' : 'badge-info'}`}>{locale === 'ar' ? note.type_ar : note.type_en}</span>
        <span>{locale === 'ar' ? note.surah_ar : note.surah_en} <span className="num">{note.ayah}</span></span>
        <span className="faint">· {note.author_name}</span>
        <span className="spacer" />
        {note.routed_to_technician && <span className="badge badge-muted">{t('session.routed_tech')}</span>}
        {note.current_decision && !note.routed_to_technician && (
          <span className={`badge ${note.current_decision === 'reject' ? 'badge-muted' : note.current_decision === 'studio' ? 'badge-gold' : 'badge-ok'}`}>
            {note.current_decision === 'studio' ? t('session.pending_studio') : t(`decision.${note.current_decision}`)}
          </span>
        )}
      </div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.body}</p>
      {note.decisions?.length > 0 && (
        <div className="faint" style={{ fontSize: '0.8rem', marginTop: 6 }}>
          {note.decisions.map((h: any, i: number) => (
            <div key={i}>{t(`decision.${h.decision}`)} · {h.by} · {dual(h.decided_at, locale, true)}{h.comment ? ` — ${h.comment}` : ''}</div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={onEdit}>{t('common.edit')}</button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>{t('common.delete')}</button>
        </div>
      )}
      {canDecide && !note.routed_to_technician && (
        <>
          <input className="input" style={{ marginTop: 10 }} placeholder={t('session.decision_comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="decision-bar">
            {(['accept', 'reject', 'studio', 'technician'] as const).map((dc) => (
              <button key={dc} className={`btn${note.current_decision === dc ? ' on' : ''}`} disabled={busy} onClick={() => decide(dc)}>{t(`decision.${dc}`)}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
