import { Async, DualDate, Empty, useToast } from '../../components/ui';
import { TodayCard } from '../../components/TodayCard';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { timeOnly } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

/** ATT-01..07: today's check-in plus the attendance & excuse log for the project. */
export function RecordingTab({ ctx }: { ctx: ProjectCtx }) {
  const { t, locale } = useI18n();
  const { isManagement } = useAuth();
  const toast = useToast();
  const p = ctx.data.project;
  const log = useApi<any>(`/attendance?project_id=${p.id}`);

  const setStatus = async (id: number, status: 'accepted' | 'rejected') => {
    try {
      await api.patch(`/excuses/${id}`, { status });
      toast(t('common.saved'));
      log.reload(true);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <div className="stack">
      {['recording', 'approved'].includes(p.status) && <TodayCard projectId={p.id} />}
      <div className="grid grid-2">
        <section className="card">
          <div className="card-head"><h2>{t('attendance.sittings')}</h2></div>
          <Async state={log}>
            {(d) => d.sittings.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.date')}</th><th>{t('attendance.checkins')}</th><th>{t('attendance.outcome')}</th><th>{t('attendance.sessions')}</th></tr></thead>
                  <tbody>
                    {d.sittings.map((s: any) => (
                      <tr key={s.id}>
                        <td><DualDate value={s.sitting_date} /></td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {s.checkins.map((c: any) => <div key={c.role}>{t(`team_roles.${c.role}`)}: {c.full_name} <span className="faint num">{timeOnly(c.checked_in_at, locale)}</span></div>)}
                        </td>
                        <td>{s.outcome ? t(`outcome.${s.outcome}`) : <span className="badge badge-info">{t('today.sitting_open')}</span>}{s.outcome_note && <div className="faint">{s.outcome_note}</div>}</td>
                        <td className="num">{s.session_numbers?.join('، ') ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty />}
          </Async>
        </section>
        <section className="card">
          <div className="card-head"><h2>{t('attendance.excuses')}</h2></div>
          <Async state={log}>
            {(d) => d.excuses.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.name')}</th><th>{t('common.date')}</th><th>{t('common.reason')}</th><th>{t('common.status')}</th></tr></thead>
                  <tbody>
                    {d.excuses.map((e: any) => (
                      <tr key={e.id}>
                        <td>{e.full_name}</td>
                        <td className="num" style={{ fontSize: '0.8rem' }}><DualDate value={e.date_from} />{e.date_to !== e.date_from && <> → <DualDate value={e.date_to} /></>}</td>
                        <td>{e.reason}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <span className={`badge ${e.status === 'accepted' ? 'badge-ok' : 'badge-red'}`}>{t(`attendance.${e.status}`)}</span>
                            {e.is_late && <span className="badge badge-orange">{t('attendance.late')}</span>}
                          </div>
                          {isManagement && (
                            <button className="btn btn-sm btn-ghost" onClick={() => setStatus(e.id, e.status === 'accepted' ? 'rejected' : 'accepted')}>
                              {e.status === 'accepted' ? t('attendance.reject') : t('attendance.accept')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty />}
          </Async>
        </section>
      </div>
    </div>
  );
}
