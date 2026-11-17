import { useEffect, useState } from 'react';
import { Async, ErrorBox, Field, Weekdays, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';

const HOURS = ['editing_hours', 'review_hours', 'decision_hours', 'corrections_hours', 'quality_rating_hours', 'mixing_hours', 'orange_grace_hours', 'pm_grace_hours'] as const;

/** ADM-02 / section 11.2: settings stay with management so they can change with workload. */
export function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const state = useApi<any>('/settings');
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.data) setS(state.data.settings); }, [state.data]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.put<any>('/settings', s);
      setS(r.settings);
      toast(t('settings.saved'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('settings.title')}</h1>
        <button className="btn btn-primary" disabled={busy || !s} onClick={save}>{t('common.save')}</button>
      </div>
      <ErrorBox error={error} />
      <Async state={state}>
        {() => s && (
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <section className="card">
              <h2>{t('settings.timers')}</h2>
              <div className="form-grid">
                {HOURS.map((k) => (
                  <Field key={k} label={t(`settings.${k}`)}>
                    <input className="input num" type="number" min={0} step={1} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
                  </Field>
                ))}
                <Field label={t('settings.day_counting')} full>
                  <div className="segmented">
                    {(['calendar', 'working'] as const).map((m) => <button key={m} className={s.day_counting === m ? 'on' : ''} onClick={() => setS({ ...s, day_counting: m })}>{t(`settings.${m}`)}</button>)}
                  </div>
                </Field>
                {s.day_counting === 'working' && (
                  <Field label={t('settings.weekend_days')} full><Weekdays value={s.weekend_days} onChange={(v) => setS({ ...s, weekend_days: v })} /></Field>
                )}
              </div>
            </section>
            <section className="card">
              <h2>{t('settings.workflow')}</h2>
              <div className="stack">
                <label className="checkbox"><input type="checkbox" checked={s.auto_pass_no_notes} onChange={(e) => setS({ ...s, auto_pass_no_notes: e.target.checked })} /> {t('settings.auto_pass_no_notes')}</label>
                <label className="checkbox"><input type="checkbox" checked={s.technical_notes_to_technician} onChange={(e) => setS({ ...s, technical_notes_to_technician: e.target.checked })} /> {t('settings.technical_notes_to_technician')}</label>
                <div className="divider" />
                <Field label={t('settings.excuse_cutoff')}>
                  <div className="segmented">
                    <button className={s.excuse_cutoff.mode === 'hours' ? 'on' : ''} onClick={() => setS({ ...s, excuse_cutoff: { ...s.excuse_cutoff, mode: 'hours' } })}>{t('settings.cutoff_hours')}</button>
                    <button className={s.excuse_cutoff.mode === 'fixed' ? 'on' : ''} onClick={() => setS({ ...s, excuse_cutoff: { ...s.excuse_cutoff, mode: 'fixed' } })}>{t('settings.cutoff_fixed')}</button>
                  </div>
                </Field>
                {s.excuse_cutoff.mode === 'hours' ? (
                  <Field label={t('settings.cutoff_hours')}><input className="input num" type="number" min={0} max={72} value={s.excuse_cutoff.hours} onChange={(e) => setS({ ...s, excuse_cutoff: { ...s.excuse_cutoff, hours: Number(e.target.value) } })} /></Field>
                ) : (
                  <Field label={t('settings.cutoff_fixed')}><input className="input" type="time" value={s.excuse_cutoff.time} onChange={(e) => setS({ ...s, excuse_cutoff: { ...s.excuse_cutoff, time: e.target.value } })} /></Field>
                )}
                <Field label={t('settings.random_quality_after_session')}>
                  <input className="input num" type="number" min={1} value={s.random_quality_after_session} onChange={(e) => setS({ ...s, random_quality_after_session: Number(e.target.value) })} />
                </Field>
              </div>
            </section>
          </div>
        )}
      </Async>
    </>
  );
}
