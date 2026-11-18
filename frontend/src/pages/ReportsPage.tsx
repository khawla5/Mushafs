import { useState } from 'react';
import { Async, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n';
import { downloadCsv, dual } from '../lib/format';
import { useApi } from '../lib/hooks';

const REPORTS = [
  'production-status', 'stage-times', 'recording-commitment', 'clear-errors', 'reader-quality', 'review-quality',
  'recording-quality', 'speed-vs-quality', 'workload', 'annual-output', 'distribution-reach',
];

/** Hidden internal ids from report rows. */
const HIDDEN = new Set(['id', 'project_id', 'assignee_id']);

function ReportTable({ rows, name }: { rows: any[]; name: string }) {
  const { t, locale } = useI18n();
  if (!rows.length) return <Empty />;
  const cols = Object.keys(rows[0]).filter((c) => !HIDDEN.has(c));
  const label = (c: string) => t(`reports.cols.${c}`);
  const cell = (c: string, v: any) => {
    if (v === null || v === undefined) return '—';
    if (c === 'status') return t(`project_status.${v}`);
    if (c === 'stage' || c === 'bottleneck') return t(c === 'bottleneck' ? `stage.${v}` : `timer_stage.${v}`);
    if (c === 'project_type') return t(`project_type.${v}`);
    if (c === 'kind') return t(`quality.${v}`);
    if (c === 'verdict') return t(`quality.${v}`);
    if (c === 'worst_alert') return t(`alert.${v}`);
    if (c === 'channels' && Array.isArray(v)) return v.map((x) => t(`distribution.channels.${x}`)).join('، ');
    if (c === 'by_type' && typeof v === 'object') return Object.entries(v).map(([k, n]) => `${k}: ${n}`).join(' · ');
    if (c === 'rated_at') return dual(v, locale);
    return String(v);
  };
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => downloadCsv(`${name}.csv`, cols.map(label), rows.map((r) => cols.map((c) => cell(c, r[c]))))}>
          <Icon name="download" /> {t('common.export_csv')}
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{cols.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'num' : ''}>{cell(c, r[c])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

/** Section 12.1: time, quantity and quality reports built from recorded actions. */
export function ReportsPage() {
  const { t } = useI18n();
  const [name, setName] = useState(REPORTS[0]);
  const [projectId, setProjectId] = useState('');
  const [year, setYear] = useState('');
  const projects = useApi<any>('/projects');
  const qs = new URLSearchParams();
  if (projectId) qs.set('project_id', projectId);
  if (year) qs.set('year', year);
  const state = useApi<any>(`/reports/${name}${qs.toString() ? `?${qs}` : ''}`);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <div className="page-head"><h1>{t('reports.title')}</h1></div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', alignItems: 'start' }} data-session-layout>
        <nav className="card" style={{ padding: 8 }}>
          {REPORTS.map((r) => (
            <button key={r} className={`list-link${r === name ? ' active' : ''}`} onClick={() => setName(r)}>
              {t(`reports.names.${r}`)}
            </button>
          ))}
        </nav>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t(`reports.names.${name}`)}</h2>
              <div className="muted" style={{ fontSize: '0.85rem' }}>{t(`reports.questions.${name}`)}</div>
            </div>
            <div className="row">
              <select className="input" style={{ maxWidth: 220 }} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t('reports.filter_project')}>
                <option value="">{t('reports.all_projects')}</option>
                {(projects.data?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {['stage-times', 'annual-output'].includes(name) && (
                <select className="input" style={{ maxWidth: 120 }} value={year} onChange={(e) => setYear(e.target.value)} aria-label={t('common.year')}>
                  <option value="">{t('common.all')}</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>
          <Async state={state}>
            {(d) => Array.isArray(d.data) ? <ReportTable rows={d.data} name={name} /> : (
              <div className="stack">
                {Object.entries(d.data).map(([section, rows]) => (
                  <div key={section}>
                    <h3>{t(`reports.sections.${section}`)}</h3>
                    <ReportTable rows={rows as any[]} name={`${name}-${section}`} />
                  </div>
                ))}
              </div>
            )}
          </Async>
        </section>
      </div>
    </>
  );
}
