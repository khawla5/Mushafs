import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorBox, Field, fieldErrors, Weekdays, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';

/** PRJ-01: create a project and choose its type, reader or announcer, and riwayah. */
export function ProjectNewPage() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const readers = useApi<any>('/users?role=reader&active=true');
  const templates = useApi<any>('/templates');
  const [form, setForm] = useState({
    title: '', project_type: 'mushaf', riwayah: 'حفص عن عاصم', reader_id: '', session_count: '',
    recording_weekdays: [0, 1, 2, 3] as number[], sessions_per_day: 1, description: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const errs = fieldErrors(error);
  const template = templates.data?.templates.find((x: any) => x.project_type === form.project_type);
  const fixed = template?.fixed_session_count;

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<any>('/projects', {
        title: form.title,
        project_type: form.project_type,
        riwayah: form.riwayah,
        reader_id: Number(form.reader_id),
        session_count: fixed ? undefined : Number(form.session_count),
        recording_weekdays: form.recording_weekdays,
        sessions_per_day: Number(form.sessions_per_day),
        description: form.description || null,
      });
      toast(t('projects.created'));
      nav(`/projects/${r.project.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/projects">{t('projects.title')}</Link></div>
          <h1>{t('projects.create_title')}</h1>
        </div>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label={t('projects.title_label')} error={errs.title} full>
            <input className={`input${errs.title ? ' invalid' : ''}`} value={form.title} onChange={(e) => set('title', e.target.value)} required maxLength={200} />
          </Field>
          <Field label={t('projects.type')}>
            <select className="input" value={form.project_type} onChange={(e) => set('project_type', e.target.value)}>
              {(templates.data?.templates ?? []).map((tp: any) => (
                <option key={tp.id} value={tp.project_type}>{locale === 'ar' ? tp.name_ar : tp.name_en}</option>
              ))}
            </select>
          </Field>
          <Field label={t('projects.riwayah')} error={errs.riwayah}>
            <input className="input" value={form.riwayah} onChange={(e) => set('riwayah', e.target.value)} required maxLength={80} />
          </Field>
          <Field label={t('projects.reader')} error={errs.reader_id}>
            <select className={`input${errs.reader_id ? ' invalid' : ''}`} value={form.reader_id} onChange={(e) => set('reader_id', e.target.value)} required>
              <option value="">{t('project.choose_user')}</option>
              {(readers.data?.users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </Field>
          <Field label={t('projects.session_count')} hint={fixed ? t('projects.mushaf_hint') : undefined} error={errs.session_count}>
            <input className="input" type="number" min={1} max={600} value={fixed ?? form.session_count} disabled={!!fixed} onChange={(e) => set('session_count', e.target.value)} />
          </Field>
          <Field label={t('projects.recording_days')} hint={t('project.recording_days_hint')} full>
            <Weekdays value={form.recording_weekdays} onChange={(v) => set('recording_weekdays', v)} />
          </Field>
          <Field label={t('projects.sessions_per_day')}>
            <select className="input" value={form.sessions_per_day} onChange={(e) => set('sessions_per_day', Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label={`${t('projects.description')} (${t('common.optional')})`} full>
            <textarea className="input" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}><ErrorBox error={error} /></div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <Link className="btn" to="/projects">{t('common.cancel')}</Link>
          <button className="btn btn-primary" disabled={busy || !form.title.trim() || !form.reader_id || (!fixed && !form.session_count)}>{t('common.create')}</button>
        </div>
      </form>
    </>
  );
}
