import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KpiTile } from '../components/KpiTile';
import { Ring } from '../components/Ring';
import { AlertDot, Async, Empty, ProgressBar, StageBadge, StatusBadge } from '../components/ui';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { relative } from '../lib/format';
import { useApi } from '../lib/hooks';

/** Top row of KPI tiles, computed from the projects on the dashboard (no invented trends). */
function KpiRow({ projects }: { projects: any[] }) {
  const { t } = useI18n();
  const sum = (k: string) => projects.reduce((n, p) => n + (p.progress?.[k] ?? 0), 0);
  const total = sum('total');
  const recorded = sum('recorded');
  const done = sum('done');
  const active = projects.filter((p) => !['completed', 'cancelled'].includes(p.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="kpi-grid">
      <KpiTile tone="sand" icon="book" label={t('dashboard.kpi_active')} value={active} sub={t('dashboard.kpi_of_projects', { n: projects.length })} />
      <KpiTile tone="terracotta" icon="mic" label={t('dashboard.kpi_recorded')} value={recorded} sub={t('dashboard.kpi_of_sessions', { n: total })} />
      <KpiTile tone="sage" icon="check" label={t('dashboard.kpi_done')} value={done} sub={t('dashboard.kpi_of_sessions', { n: total })} />
      <KpiTile tone="mist" icon="chart" label={t('dashboard.kpi_completion')} value={`${pct}%`} sub={t('dashboard.kpi_completion_sub')} />
    </div>
  );
}

/**
 * Section 12.2 / 12.3: one dashboard, two views. Detailed (management): rings, health with reason,
 * stalls. General: progress only, never staff names or performance data.
 */
export function DashboardPage() {
  const { t, locale } = useI18n();
  const { isManagement } = useAuth();
  const [view, setView] = useState<'detailed' | 'general'>(isManagement ? 'detailed' : 'general');
  const state = useApi<any>(`/dashboard?view=${view}`);

  return (
    <>
      <div className="page-head">
        <h1>{t('dashboard.title')}</h1>
        {isManagement && (
          <div className="segmented">
            <button className={view === 'detailed' ? 'on' : ''} onClick={() => setView('detailed')}>{t('dashboard.detailed')}</button>
            <button className={view === 'general' ? 'on' : ''} onClick={() => setView('general')}>{t('dashboard.general')}</button>
          </div>
        )}
      </div>
      <Async state={state}>
        {(d) => (
          <div className="stack">
            <KpiRow projects={d.projects} />
            {d.view === 'detailed' && d.center_health && (
              <div className="card">
                <div className="row-between">
                  <h2 style={{ margin: 0 }}>{t('dashboard.center_health')}</h2>
                  <div className="row">
                    <span className="health health-green" style={{ margin: 0 }}><span className="swatch" /> <strong className="num">{d.center_health.green}</strong> {t('dashboard.healthy')}</span>
                    <span className="health health-blue" style={{ margin: 0 }}><span className="swatch" /> <strong className="num">{d.center_health.blue}</strong> {t('dashboard.attention')}</span>
                    <span className="health health-red" style={{ margin: 0 }}><span className="swatch" /> <strong className="num">{d.center_health.red}</strong> {t('dashboard.at_risk')}</span>
                  </div>
                </div>
              </div>
            )}
            {d.view === 'general' && d.reach && (
              <div className="card row" style={{ gap: 32 }}>
                <div className="kpi"><span className="v num">{d.projects.length}</span><span className="l">{t('projects.title')}</span></div>
                <div className="kpi"><span className="v num">{d.reach.recipients}</span><span className="l">{t('dashboard.recipients')}</span></div>
                <div className="kpi"><span className="v num">{d.reach.countries}</span><span className="l">{t('dashboard.countries')}</span></div>
              </div>
            )}
            {!d.projects.length && <div className="card"><Empty>{t('dashboard.no_projects')}</Empty></div>}
            <div className="grid grid-auto">
              {d.projects.map((p: any) => (
                <article key={p.id} className="card">
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0 }}>{d.view === 'detailed' ? <Link to={`/projects/${p.id}`}>{p.title}</Link> : p.title}</h3>
                      <div className="faint" style={{ fontSize: '0.8rem' }}>{t(`project_type.${p.type}`)} · {p.riwayah}{p.reader_name ? ` · ${p.reader_name}` : ''}</div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <ProgressBar total={p.progress.total} parts={[
                    { value: p.progress.done, color: 'var(--st-done)' },
                    { value: p.progress.mixed - p.progress.done, color: 'var(--st-mixed)' },
                    { value: p.progress.reviewed - p.progress.mixed, color: 'var(--st-ready)' },
                    { value: p.progress.recorded - p.progress.reviewed, color: 'var(--st-review)' },
                  ]} />
                  <div className="faint num" style={{ fontSize: '0.78rem', margin: '4px 0 12px' }}>
                    {p.progress.recorded}/{p.progress.total} {t('projects.recorded')} · {p.progress.reviewed} {t('projects.reviewed')} · {p.progress.done} {t('projects.done')}
                  </div>
                  {d.view === 'detailed' && (
                    <>
                      <div className="rings">
                        <Ring pct={p.rings.recording.pct} color="var(--ring-recording)" label={t('dashboard.recording')}
                          sub={p.rings.recording.expected ? `${t(`dashboard.${p.rings.recording.status}`)} · ${t('dashboard.expected', { a: p.rings.recording.recorded, b: p.rings.recording.expected })}` : t('dashboard.no_data')} />
                        <Ring pct={p.rings.editing.pct} color="var(--ring-editing)" label={t('dashboard.editing')} sub={p.rings.editing.pct === null ? t('dashboard.no_data') : `${p.rings.editing.on_time}/${p.rings.editing.on_time + p.rings.editing.late}`} />
                        <Ring pct={p.rings.reviews.pct} color="var(--ring-reviews)" label={t('dashboard.reviews')} sub={p.rings.reviews.pct === null ? t('dashboard.no_data') : `${p.rings.reviews.on_time}/${p.rings.reviews.on_time + p.rings.reviews.late}`} />
                        <Ring pct={p.rings.quality.pct} color="var(--ring-quality)" label={t('dashboard.quality')} sub={p.rings.quality.pct === null ? t('dashboard.no_data') : `${p.rings.quality.missed} ${t('reports.cols.missed')}`} />
                        <div className="ring">
                          <div style={{ height: 64, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
                            <div className="val num" style={{ fontSize: '1.1rem' }}>{p.distribution.recipients}</div>
                            <div className="faint num" style={{ fontSize: '0.7rem' }}>{p.distribution.countries} {t('dashboard.countries')}</div>
                          </div>
                          <span>{t('dashboard.distribution')}</span>
                        </div>
                      </div>
                      <div className={`health health-${p.health.color}`}>
                        <span className="swatch" />
                        <span>
                          {t('dashboard.health')}: {p.health.reason ? t(`dashboard.reasons.${p.health.reason}`, { v: p.health.value }) : t('dashboard.healthy')}
                        </span>
                      </div>
                      {p.stalls.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>{t('dashboard.stalls')}</div>
                          {p.stalls.map((s: any) => (
                            <Link key={s.id} to={`/sessions/${s.id}`} className="work-item" style={{ padding: '6px 0' }}>
                              <AlertDot level={s.alert_level} />
                              <span className="num">{t('common.session')} {s.number}</span>
                              <StageBadge stage={s.stage} />
                              <span className="faint" style={{ fontSize: '0.8rem' }}>{s.assignee} · {relative(s.stage_entered_at, locale)}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {d.view === 'general' && (
                    <div className="faint" style={{ fontSize: '0.8rem' }}>{p.distribution.recipients} {t('dashboard.recipients')} · {p.distribution.countries} {t('dashboard.countries')}</div>
                  )}
                </article>
              ))}
            </div>
            {d.view === 'detailed' && d.reach?.length > 0 && (
              <div className="card">
                <h2>{t('dashboard.reach')}</h2>
                <div className="chips">{d.reach.map((r: any) => <span key={r.country} className="badge">{r.country} · {r.recipients}</span>)}</div>
              </div>
            )}
          </div>
        )}
      </Async>
    </>
  );
}
