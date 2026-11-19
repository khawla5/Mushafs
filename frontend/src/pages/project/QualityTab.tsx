import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Async, DualDate, Empty, ErrorBox, StageBadge, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { DEMO } from '../../demo/mode';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

/** MIX-01..04: quality samples (first + random) and mixing (download raw, upload mixed per session). */
export function QualityTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const toast = useToast();
  const p = ctx.data.project;
  const me = ctx.data.me;
  const quality = useApi<any>(`/projects/${p.id}/quality`);
  const sessions = useApi<any>(`/projects/${p.id}/sessions`);
  const [error, setError] = useState<unknown>(null);
  const canRequest = me.is_management || me.team_roles.includes('mixing_lead');
  const mixingOpen = ['mixing', 'final_review', 'distribution', 'completed'].includes(p.status);
  const canMix = me.team_roles.includes('mixing_lead') || me.is_management;

  const requestRandom = async () => {
    setError(null);
    try {
      await api.post(`/projects/${p.id}/quality/random`);
      toast(t('quality.requested'));
      quality.reload(true);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head">
          <h2>{t('quality.title')}</h2>
          {canRequest && p.status === 'recording' && <button className="btn btn-sm" onClick={requestRandom}>{t('quality.request_random')}</button>}
        </div>
        <ErrorBox error={error} />
        <Async state={quality}>
          {(d) => d.ratings.length ? (
            <div className="stack" style={{ gap: 0 }}>
              {d.ratings.map((q: any) => (
                <div key={q.id} className="work-item" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div className="title">{t(`quality.${q.kind}`)}{q.session_number ? <> · <Link to={`/sessions/${q.session_id}`}>{t('common.session')} {q.session_number}</Link></> : null}</div>
                    <div className="meta">
                      {q.verdict ? <>{q.rated_by_name} · <DualDate value={q.rated_at} /></> : q.session_id ? <DualDate value={q.requested_at} /> : t('quality.waiting')}
                    </div>
                    {q.notes && <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{q.notes}</div>}
                  </div>
                  {q.verdict ? (
                    <span className={`badge ${q.verdict === 'approved' ? 'badge-ok' : 'badge-red'}`}>{t(`quality.${q.verdict}`)}</span>
                  ) : q.session_id && me.team_roles.includes('mixing_lead') ? (
                    <Link className="btn btn-sm btn-primary" to={`/sessions/${q.session_id}`}>{t('session.rate')}</Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Async>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t('quality.mixing')}</h2>
          {mixingOpen && canMix && !DEMO && (
            <a className="btn btn-sm" href={`/api/projects/${p.id}/raw-archive`} download><Icon name="download" /> {t('quality.download_raw')}</a>
          )}
        </div>
        {!mixingOpen ? <div className="alert-box info">{t('quality.not_ready')}</div> : <p className="muted">{t('quality.mixing_hint')}</p>}
        <Async state={sessions}>
          {(d) => (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>#</th><th>{t('common.status')}</th><th>{t('project.raw_v')}</th><th>{t('project.mixed_v')}</th><th /></tr></thead>
                <tbody>
                  {d.sessions.map((s: any) => (
                    <tr key={s.id}>
                      <td className="num">{s.number}</td>
                      <td><StageBadge stage={s.stage} /></td>
                      <td className="num">{s.raw_version ?? '—'}</td>
                      <td className="num">{s.mixed_version ?? '—'}</td>
                      <td><Link className="btn btn-sm btn-ghost" to={`/sessions/${s.id}`}>{t('common.open')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </section>
    </div>
  );
}
