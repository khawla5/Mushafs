import { useState } from 'react';
import { DualDate, ErrorBox, Field, ProgressBar, Weekdays, useToast } from '../../components/ui';
import { RiwayahSelect } from '../../components/RiwayahSelect';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { ProjectCtx } from '../ProjectPage';

export function OverviewTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const { isManagement } = useAuth();
  const toast = useToast();
  const p = ctx.data.project;
  const s = ctx.data.stats;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: p.title, riwayah: p.riwayah, description: p.description ?? '', recording_weekdays: p.recording_weekdays as number[], sessions_per_day: p.sessions_per_day });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/projects/${p.id}`, { ...form, description: form.description || null });
      toast(t('common.saved'));
      setEditing(false);
      await ctx.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const total = s.total || p.session_count;
  const kpis = [
    { l: t('projects.recorded'), v: s.recorded },
    { l: t('projects.reviewed'), v: s.ready },
    { l: t('stage.mixed'), v: s.mixed },
    { l: t('projects.done'), v: s.done },
  ];

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head"><h2>{t('project.stats')}</h2><span className="muted num">{total} {t('common.sessions')}</span></div>
        <ProgressBar total={total} parts={[
          { value: s.done, color: 'var(--st-done)' },
          { value: s.mixed - s.done, color: 'var(--st-mixed)' },
          { value: s.ready - s.mixed, color: 'var(--st-ready)' },
          { value: s.recorded - s.ready, color: 'var(--st-review)' },
        ]} />
        <div className="grid grid-2" style={{ marginTop: 16, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {kpis.map((k) => <div key={k.l} className="kpi"><span className="v num">{k.v}</span><span className="l">{k.l}</span></div>)}
        </div>
        <div className="divider" />
        <dl className="stack" style={{ margin: 0, gap: 6, fontSize: '0.9rem' }}>
          <div className="row-between"><dt className="muted">{t('journey.approved')}</dt><dd style={{ margin: 0 }}><DualDate value={p.approved_at} /></dd></div>
          <div className="row-between"><dt className="muted">{t('journey.recording')}</dt><dd style={{ margin: 0 }}><DualDate value={p.started_at} /></dd></div>
          {p.mixing_started_at && <div className="row-between"><dt className="muted">{t('journey.mixing')}</dt><dd style={{ margin: 0 }}><DualDate value={p.mixing_started_at} /></dd></div>}
          {p.completed_at && <div className="row-between"><dt className="muted">{t('journey.published')}</dt><dd style={{ margin: 0 }}><DualDate value={p.completed_at} /></dd></div>}
        </dl>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t('common.details')}</h2>
          {isManagement && !editing && !['completed', 'cancelled'].includes(p.status) && <button className="btn btn-sm" onClick={() => setEditing(true)}>{t('project.edit_details')}</button>}
        </div>
        {editing ? (
          <div className="stack">
            <Field label={t('projects.title_label')}><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label={t('projects.riwayah')}><RiwayahSelect value={form.riwayah} onChange={(v) => setForm({ ...form, riwayah: v })} /></Field>
            <Field label={t('projects.recording_days')} hint={t('project.recording_days_hint')}>
              <Weekdays value={form.recording_weekdays} onChange={(v) => setForm({ ...form, recording_weekdays: v })} />
            </Field>
            <Field label={t('projects.sessions_per_day')}>
              <select className="input" value={form.sessions_per_day} onChange={(e) => setForm({ ...form, sessions_per_day: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label={t('projects.description')}><textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <ErrorBox error={error} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{t('common.save')}</button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div><div className="muted" style={{ fontSize: '0.85rem' }}>{t('projects.recording_days')}</div><Weekdays value={p.recording_weekdays} /></div>
            <div className="row-between"><span className="muted">{t('projects.sessions_per_day')}</span><span className="num">{p.sessions_per_day}</span></div>
            <div className="row-between"><span className="muted">{t('projects.reader')}</span><span>{p.reader_name}</span></div>
            {p.description && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{p.description}</p>}
            <div className="divider" />
            <h3>{t('project.team')}</h3>
            {ctx.data.team.length ? ctx.data.team.map((m: any) => (
              <div key={m.id} className="row-between"><span className="muted">{t(`team_roles.${m.team_role}`)}</span><span>{m.full_name}</span></div>
            )) : <span className="faint">{t('common.none')}</span>}
          </div>
        )}
      </section>
    </div>
  );
}
