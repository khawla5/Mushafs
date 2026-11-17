import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertDot, Async, Empty, ProgressBar, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';

const STATUSES = ['pending_approval', 'approved', 'recording', 'mixing', 'final_review', 'distribution', 'completed', 'cancelled'];

export function ProjectsPage() {
  const { t } = useI18n();
  const { has } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const state = useApi<any>(`/projects${status ? `?status=${status}` : ''}`);

  return (
    <>
      <div className="page-head">
        <h1>{t('projects.title')}</h1>
        {has('admin', 'production_manager') && (
          <Link className="btn btn-primary" to="/projects/new"><Icon name="plus" /> {t('projects.new')}</Link>
        )}
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        <select className="input" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`project_status.${s}`)}</option>)}
        </select>
      </div>
      <Async state={state}>
        {(d) => {
          const q = query.trim().toLowerCase();
          const rows = d.projects.filter((p: any) => !q || `${p.title} ${p.code} ${p.reader_name}`.toLowerCase().includes(q));
          if (!rows.length) return <div className="card"><Empty>{t('projects.none')}</Empty></div>;
          return (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('projects.code')}</th>
                    <th>{t('common.project')}</th>
                    <th className="hide-sm">{t('projects.type')}</th>
                    <th className="hide-sm">{t('projects.reader')}</th>
                    <th>{t('common.status')}</th>
                    <th style={{ minWidth: 160 }}>{t('projects.progress')}</th>
                    <th aria-label={t('project.alerts_in_list')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p: any) => (
                    <tr key={p.id} className="clickable" onClick={() => nav(`/projects/${p.id}`)}>
                      <td className="num">{p.code}</td>
                      <td><Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.title}</Link><div className="faint" style={{ fontSize: '0.8rem' }}>{p.riwayah}</div></td>
                      <td className="hide-sm">{t(`project_type.${p.project_type}`)}</td>
                      <td className="hide-sm">{p.reader_name}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <ProgressBar total={p.session_count} parts={[
                          { value: p.done_count, color: 'var(--st-done)', label: t('projects.done') },
                          { value: p.ready_count - p.done_count, color: 'var(--st-ready)', label: t('projects.reviewed') },
                          { value: p.recorded_count - p.ready_count, color: 'var(--st-review)', label: t('projects.recorded') },
                        ]} />
                        <div className="faint num" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          {p.recorded_count}/{p.session_count} {t('projects.recorded')} · {p.done_count} {t('projects.done')}
                        </div>
                      </td>
                      <td><AlertDot level={p.alert_level} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>
    </>
  );
}
