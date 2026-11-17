import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { dual, gregorian, timeOnly, todayIso } from '../lib/format';
import { useNotifications } from '../lib/notifications';
import { ErrorBox, Field, Loading, Modal, useToast } from './ui';

type Seat = 'reader' | 'mujiz' | 'technician';

function rangeText(s: any, locale: string) {
  if (!s) return '';
  if (!s.start_surah) return s.title ?? '';
  const a = locale === 'ar' ? s.start_surah_ar : s.start_surah_en;
  const b = locale === 'ar' ? s.end_surah_ar : s.end_surah_en;
  return `${a} ${s.start_ayah} – ${b} ${s.end_ayah}`;
}
export { rangeText };

/**
 * ATT-01: "Today" screen – the next session in sequence (number and range) with Check-in and
 * Excuse buttons; yesterday's session dimmed above, upcoming sessions below (home screen principle).
 */
export function TodayCard({ projectId, title, compact }: { projectId: number; title?: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { tick } = useNotifications();
  const state = useApi<any>(`/projects/${projectId}/today`, [tick]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [excuseOpen, setExcuseOpen] = useState(false);

  if (state.loading && !state.data) return <div className="card"><Loading /></div>;
  if (state.error && !state.data) return <div className="card"><ErrorBox error={state.error} onRetry={state.reload} /></div>;
  const d = state.data;
  if (!d) return null;

  const checkin = async (role: Seat, outcome?: string, outcome_note?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/checkin`, { role, outcome, outcome_note: outcome_note || null });
      toast(t('today.checked_in'));
      setOutcomeOpen(false);
      await state.reload(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const done = new Map<string, any>((d.sitting?.checkins ?? []).map((c: any) => [c.role, c]));
  const seats: Seat[] = d.my_seats;
  const order: Seat[] = ['reader', 'mujiz', 'technician'];

  return (
    <div className="card">
      <div className="card-head">
        <h2>
          {title ? <Link to={`/projects/${projectId}`}>{title}</Link> : t('today.title')}
        </h2>
        <span className="muted num">{dual(d.today, locale)}</span>
      </div>

      {d.project.status !== 'recording' ? (
        <div className="alert-box info">{t('today.not_started')}</div>
      ) : (
        <>
          {d.previous && !compact && (
            <div className="today-prev">
              {t('today.previous')}: <strong>{d.previous.number}</strong> · {rangeText(d.previous, locale)}
            </div>
          )}
          {d.next ? (
            <div className="today-current">
              <div className="muted">{t('today.next')}</div>
              <div className="big num">{d.next.number}</div>
              <div className="range">{rangeText(d.next, locale)}</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                <span className={`badge ${d.is_recording_day ? 'badge-ok' : 'badge-muted'}`}>
                  {d.is_recording_day ? t('today.recording_day') : t('today.not_recording_day')}
                </span>
                {seats.length > 0 && <span className="badge">{t('today.my_seat', { seat: seats.map((s) => t(`team_roles.${s}`)).join('، ') })}</span>}
              </div>
              <div className="checkin-steps">
                {order.map((role) => {
                  const c = done.get(role);
                  return (
                    <div key={role} className={`checkin-step${c ? ' done' : ''}`}>
                      <strong>{t(`team_roles.${role}`)}</strong>
                      <div className="muted">{c ? `${t('today.checked_in')} ${timeOnly(c.checked_in_at, locale)}` : '—'}</div>
                    </div>
                  );
                })}
              </div>
              <ErrorBox error={error} />
              <div className="row" style={{ justifyContent: 'center' }}>
                {seats.map((role) => {
                  const can = d.can_check_in[role];
                  const waitingFor = order.slice(0, order.indexOf(role)).find((r) => !done.has(r));
                  return (
                    <button
                      key={role}
                      className="btn btn-primary btn-lg"
                      disabled={!can || busy}
                      title={!can && waitingFor ? t('today.waiting_for', { role: t(`team_roles.${waitingFor}`) }) : undefined}
                      onClick={() => (role === 'technician' ? setOutcomeOpen(true) : checkin(role))}
                    >
                      {done.has(role) ? `✓ ${t('today.checked_in')}` : t('today.checkin')}
                      {seats.length > 1 ? ` (${t(`team_roles.${role}`)})` : ''}
                    </button>
                  );
                })}
                {seats.length > 0 && <button className="btn btn-lg" onClick={() => setExcuseOpen(true)}>{t('today.excuse')}</button>}
              </div>
              {d.excuse_window?.cutoff_next_day && seats.length > 0 && (
                <p className="faint" style={{ marginTop: 10, fontSize: '0.8rem' }}>
                  {t('today.excuse_cutoff', { time: `${gregorian(d.excuse_window.cutoff_next_day, locale, true)}` })}
                </p>
              )}
            </div>
          ) : (
            <div className="alert-box ok">{t('today.all_recorded')}</div>
          )}
          {!compact && d.upcoming?.length > 0 && (
            <div className="today-upcoming">
              <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 4 }}>{t('today.upcoming')}</div>
              {d.upcoming.map((s: any) => (
                <div key={s.id} className="item"><strong className="num">{s.number}</strong> · {rangeText(s, locale)}</div>
              ))}
            </div>
          )}
        </>
      )}

      {outcomeOpen && <OutcomeModal busy={busy} error={error} onClose={() => setOutcomeOpen(false)} onSubmit={(o, n) => checkin('technician', o, n)} />}
      {excuseOpen && <ExcuseModal projectId={projectId} onClose={() => setExcuseOpen(false)} onDone={() => { setExcuseOpen(false); toast(t('today.excuse_sent')); }} />}
    </div>
  );
}

/** ATT-06: technician records what was done at check-in. */
function OutcomeModal({ onClose, onSubmit, busy, error }: { onClose: () => void; onSubmit: (o: string, note: string) => void; busy: boolean; error: unknown }) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState('full');
  const [note, setNote] = useState('');
  return (
    <Modal
      title={t('today.outcome_title')}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={busy} onClick={() => onSubmit(outcome, note)}>{t('today.checkin')}</button></>}
    >
      <div className="stack">
        {['full', 'two_sessions', 'corrections_only', 'incomplete'].map((o) => (
          <label key={o} className="checkbox">
            <input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} /> {t(`outcome.${o}`)}
          </label>
        ))}
        <Field label={t('today.outcome_note')}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

/** ATT-04/05: excuse for one day or a date range, with a reason. */
export function ExcuseModal({ projectId, onClose, onDone }: { projectId: number; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [late, setLate] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<any>(`/projects/${projectId}/excuses`, { date_from: from, date_to: to < from ? from : to, reason });
      if (r.excuse.is_late) {
        setLate(true);
        setTimeout(onDone, 1800);
      } else onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('today.excuse_title')}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={busy || !reason.trim() || late} onClick={submit}>{t('common.submit')}</button></>}
    >
      <div className="form-grid">
        <Field label={t('common.from')}><input className="input" type="date" min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
        <Field label={t('common.to')} hint={t('today.excuse_range')}><input className="input" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={t('common.reason')} full><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </div>
      {late && <div className="alert-box warn" style={{ marginTop: 12 }}>{t('today.excuse_late')}</div>}
      <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div>
    </Modal>
  );
}
