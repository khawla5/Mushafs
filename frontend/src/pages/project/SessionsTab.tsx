import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertDot, Async, Empty, StageBadge } from '../../components/ui';
import { rangeText } from '../../components/TodayCard';
import { useI18n } from '../../i18n';
import { relative } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useNotifications } from '../../lib/notifications';
import type { ProjectCtx } from '../ProjectPage';

const STAGES = ['pending', 'editing', 'in_review', 'awaiting_pass', 'pm_forward', 'in_decision', 'in_corrections', 'ready_for_mixing', 'mixed', 'done'];

/** Production manager view: sessions × stages with alerts visible without opening (TMR-03). */
export function SessionsTab({ ctx }: { ctx: ProjectCtx }) {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { tick } = useNotifications();
  const state = useApi<any>(`/projects/${ctx.data.project.id}/sessions`, [tick]);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  if (ctx.data.project.status === 'pending_approval') return <div className="card"><Empty /></div>;

  return (
    <Async state={state}>
      {(d) => (
        <div className="card">
          <div className="card-head">
            <div className="legend">
              {STAGES.map((s) => <StageBadge key={s} stage={s} />)}
              <span className="row" style={{ gap: 4 }}><span className="dot dot-orange" /> {t('alert.1')}</span>
              <span className="row" style={{ gap: 4 }}><span className="dot dot-red" /> {t('alert.2')}</span>
            </div>
            <div className="segmented">
              <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>▦</button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>☰</button>
            </div>
          </div>
          {view === 'grid' ? (
            <div className="session-grid">
              {d.sessions.map((s: any) => (
                <Link
                  key={s.id}
                  to={`/sessions/${s.id}`}
                  className={`cell st-${s.stage} alert-${s.alert_level}`}
                  title={`${t('common.session')} ${s.number} · ${t(`stage.${s.stage}`)}${s.current_round_type ? ` · ${t(`round.${s.current_round_type}`)}` : ''}${s.alert_level ? ` · ${t(`alert.${s.alert_level}`)}` : ''}`}
                >
                  {s.unread && <span className="cell-dot" />}
                  <span className="num">{s.number}</span>
                  {s.current_round_type && s.stage === 'in_review' && <small>{t(`round_short.${s.current_round_type}`)}</small>}
                </Link>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>{t('session.range')}</th><th>{t('common.status')}</th><th className="hide-sm">{t('project.current_round')}</th>
                    <th className="hide-sm">{t('session.notes')}</th><th className="hide-sm">{t('project.raw_v')}</th><th className="hide-sm">{t('project.mixed_v')}</th><th>{t('common.due')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.sessions.map((s: any) => (
                    <tr key={s.id} className="clickable" onClick={() => nav(`/sessions/${s.id}`)}>
                      <td className="num"><strong>{s.number}</strong></td>
                      <td>{rangeText(s, locale) || '—'}</td>
                      <td><StageBadge stage={s.stage} /></td>
                      <td className="hide-sm">{s.current_round_type ? <>{t(`round.${s.current_round_type}`)} · {s.current_reviewer_name}</> : '—'}</td>
                      <td className="hide-sm num">{s.notes_count}{s.open_corrections ? ` (${s.open_corrections})` : ''}</td>
                      <td className="hide-sm num">{s.raw_version ?? '—'}</td>
                      <td className="hide-sm num">{s.mixed_version ?? '—'}</td>
                      <td><span className="row" style={{ gap: 6 }}><AlertDot level={s.alert_level} />{s.due_at ? relative(s.due_at, locale) : ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Async>
  );
}
