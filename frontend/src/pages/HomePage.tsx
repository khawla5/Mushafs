import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertDot, Async, StageBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import { TodayCard } from '../components/TodayCard';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { relative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useNotifications } from '../lib/notifications';

function Section({ title, icon, count, children }: { title: string; icon: string; count?: number; children: ReactNode }) {
  return (
    <section className="card work-section">
      <h2><Icon name={icon} /> {title} {count ? <span className="badge">{count}</span> : null}</h2>
      <div className="work-list">{children}</div>
    </section>
  );
}

function Item({ to, title, meta, extra, unread, alert }: { to: string; title: ReactNode; meta?: ReactNode; extra?: ReactNode; unread?: boolean; alert?: number }) {
  return (
    <Link to={to} className="work-item">
      {unread ? <span className="dot dot-unread" aria-label="unread" /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title">{title}</div>
        {meta && <div className="meta">{meta}</div>}
      </div>
      {extra}
      <AlertDot level={alert} />
    </Link>
  );
}

/** Home screen: today's work in the middle, by role; daily actions take one tap. */
export function HomePage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { tick } = useNotifications();
  const state = useApi<any>('/me/work', [tick]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('home.title')}</h1>
          <div className="muted">{t('home.greeting', { name: user?.full_name })}</div>
        </div>
      </div>
      <Async state={state}>
        {(w) => {
          const m = w.management;
          const empty = !w.recording.length && !w.reviews.length && !w.decisions.length && !w.technician.length && !w.quality.length && !w.mixing.length && !w.finalForward.length
            && (!m || (!m.awaitingApproval.length && !m.awaitingStart.length && !m.awaitingFinalSplit.length && !m.inDistribution.length && !m.alerts.length));
          return (
            <div className="stack">
              {empty && <div className="card empty">{t('home.nothing')}</div>}

              {w.recording.length > 0 && (
                <div className="grid grid-auto">
                  {w.recording
                    .filter((p: any, i: number, arr: any[]) => arr.findIndex((x) => x.id === p.id) === i)
                    .map((p: any) => <TodayCard key={p.id} projectId={p.id} title={p.title} compact={w.recording.length > 1} />)}
                </div>
              )}

              <div className="grid grid-2">
                {w.reviews.length > 0 && (
                  <Section title={t('home.reviews')} icon="list" count={w.reviews.length}>
                    {w.reviews.map((r: any) => (
                      <Item key={r.round_id} to={`/sessions/${r.session_id}`} unread={r.unread} alert={r.alert_level}
                        title={<>{t('common.session')} <span className="num">{r.number}</span> · {r.project_title}</>}
                        meta={<>{t(`round.${r.round_type}`)} · {relative(r.assigned_at, locale)}</>} />
                    ))}
                  </Section>
                )}
                {w.decisions.length > 0 && (
                  <Section title={t('home.decisions')} icon="check" count={w.decisions.length}>
                    {w.decisions.map((r: any) => (
                      <Item key={r.session_id} to={`/sessions/${r.session_id}`} alert={r.alert_level}
                        title={<>{t('common.session')} <span className="num">{r.number}</span> · {r.project_title}</>}
                        meta={t('home.pending_notes', { n: r.pending_notes })} />
                    ))}
                  </Section>
                )}
                {w.technician.length > 0 && (
                  <Section title={t('home.technician')} icon="upload" count={w.technician.length}>
                    {w.technician.map((r: any) => (
                      <Item key={r.session_id} to={`/sessions/${r.session_id}`} alert={r.alert_level}
                        title={<>{t('common.session')} <span className="num">{r.number}</span> · {r.project_title}</>}
                        meta={r.open_corrections ? t('home.open_corrections', { n: r.open_corrections }) : undefined}
                        extra={<StageBadge stage={r.stage} />} />
                    ))}
                  </Section>
                )}
                {w.quality.length > 0 && (
                  <Section title={t('home.quality')} icon="flag" count={w.quality.length}>
                    {w.quality.map((q: any) => (
                      <Item key={q.id} to={q.session_id ? `/sessions/${q.session_id}` : `/projects/${q.project_id}`}
                        title={<>{q.project_title}{q.number ? <> · {t('common.session')} <span className="num">{q.number}</span></> : null}</>}
                        meta={q.session_id ? t(`quality.${q.kind}`) : t('quality.waiting')} />
                    ))}
                  </Section>
                )}
                {w.mixing.length > 0 && (
                  <Section title={t('home.mixing')} icon="mic" count={w.mixing.length}>
                    {w.mixing.map((p: any) => (
                      <Item key={p.project_id} to={`/projects/${p.project_id}?tab=quality`} title={p.project_title}
                        meta={[t('home.to_mix', { n: p.to_mix }), t('home.mixed_count', { n: p.mixed }), p.final_corrections ? t('home.final_corrections', { n: p.final_corrections }) : ''].filter(Boolean).join(' · ')} />
                    ))}
                  </Section>
                )}
                {w.finalForward.length > 0 && (
                  <Section title={t('home.forward')} icon="send" count={w.finalForward.length}>
                    {w.finalForward.map((r: any) => (
                      <Item key={r.session_id} to={`/sessions/${r.session_id}`} title={<>{t('common.session')} <span className="num">{r.number}</span> · {r.project_title}</>} meta={t('home.notes_count', { n: r.notes })} />
                    ))}
                  </Section>
                )}
                {m?.awaitingApproval.length > 0 && (
                  <Section title={t('home.approvals')} icon="shield" count={m.awaitingApproval.length}>
                    {m.awaitingApproval.map((p: any) => <Item key={p.id} to={`/projects/${p.id}`} title={p.title} />)}
                  </Section>
                )}
                {m?.awaitingStart.length > 0 && (
                  <Section title={t('home.to_start')} icon="users" count={m.awaitingStart.length}>
                    {m.awaitingStart.map((p: any) => <Item key={p.id} to={`/projects/${p.id}?tab=team`} title={p.title} />)}
                  </Section>
                )}
                {m?.awaitingFinalSplit.length > 0 && (
                  <Section title={t('home.final_split')} icon="list" count={m.awaitingFinalSplit.length}>
                    {m.awaitingFinalSplit.map((p: any) => <Item key={p.id} to={`/projects/${p.id}?tab=final`} title={p.title} />)}
                  </Section>
                )}
                {m?.inDistribution.length > 0 && (
                  <Section title={t('home.distribution')} icon="globe" count={m.inDistribution.length}>
                    {m.inDistribution.map((p: any) => <Item key={p.id} to={`/projects/${p.id}?tab=distribution`} title={p.title} />)}
                  </Section>
                )}
                {m?.alerts.length > 0 && (
                  <Section title={t('home.alerts')} icon="clock" count={m.alerts.length}>
                    {m.alerts.map((a: any) => (
                      <Item key={a.id} to={a.session_id ? `/sessions/${a.session_id}` : `/projects/${a.project_id}`} alert={a.alert_level}
                        title={<>{a.project_title}{a.number ? <> · {t('common.session')} <span className="num">{a.number}</span></> : null}</>}
                        meta={<>{t(`timer_stage.${a.stage}`)} · {a.assignee ?? '—'} · {relative(a.due_at, locale)}</>} />
                    ))}
                  </Section>
                )}
              </div>
            </div>
          );
        }}
      </Async>
    </>
  );
}
