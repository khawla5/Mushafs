import { useState } from 'react';
import { Async, DualDate, ErrorBox, Field, Modal, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

const SEATS = [
  { role: 'mujiz', userRole: 'mujiz', required: true },
  { role: 'technician', userRole: 'technician', required: true },
  { role: 'reviewer1', userRole: 'reviewer', required: true },
  { role: 'reviewer2', userRole: 'reviewer', required: true },
  { role: 'mixing_lead', userRole: 'mixing_lead', required: false },
] as const;

/** PRJ-04/05/07: assign the team; changes keep history. */
export function TeamTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const { has } = useAuth();
  const toast = useToast();
  const p = ctx.data.project;
  const canEdit = has('admin', 'production_manager') && !['completed', 'cancelled'].includes(p.status);
  const history = useApi<any>(`/projects/${p.id}/team/history`, [ctx.data]);
  const [seat, setSeat] = useState<(typeof SEATS)[number] | null>(null);
  const current = (role: string) => ctx.data.team.find((m: any) => m.team_role === role);
  const finals = ctx.data.team.filter((m: any) => m.team_role === 'final_reviewer');

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head"><h2>{t('project.team')}</h2></div>
        <div className="stack" style={{ gap: 0 }}>
          <div className="work-item" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}><div className="meta">{t('team_roles.reader')}</div><div className="title">{p.reader_name}</div></div>
          </div>
          {SEATS.map((s) => {
            const m = current(s.role);
            return (
              <div key={s.role} className="work-item" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div className="meta">{t(`team_roles.${s.role}`)}{s.required ? ' *' : ` (${t('common.optional')})`}</div>
                  <div className="title">{m ? m.full_name : <span className="faint">—</span>}</div>
                </div>
                {canEdit && <button className="btn btn-sm" onClick={() => setSeat(s)}>{m ? t('project.replace') : t('project.assign')}</button>}
              </div>
            );
          })}
          {finals.map((m: any) => (
            <div key={m.id} className="work-item" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}><div className="meta">{t('team_roles.final_reviewer')}</div><div className="title">{m.full_name}</div></div>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>{t('project.team_history')}</h2></div>
        <Async state={history}>
          {(h) => (
            <ul className="timeline">
              {h.history.map((m: any) => (
                <li key={m.id} className={m.removed_at ? '' : 'done'}>
                  <div className="t-title">{t(`team_roles.${m.team_role}`)}: {m.full_name}</div>
                  <div className="t-meta">{t('project.assigned_on')} <DualDate value={m.assigned_at} /> · {m.assigned_by_name}</div>
                  {m.removed_at && <div className="t-meta">{t('project.removed_on')} <DualDate value={m.removed_at} /> · {m.removed_by_name}</div>}
                  {m.change_reason && <div className="t-meta">{t('common.reason')}: {m.change_reason}</div>}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </section>
      {seat && (
        <AssignModal
          projectId={p.id}
          seat={seat}
          replacing={!!current(seat.role)}
          excludeIds={[p.reader_id]}
          onClose={() => setSeat(null)}
          onDone={async () => { setSeat(null); toast(t('common.saved')); await ctx.reload(); }}
        />
      )}
    </div>
  );
}

function AssignModal({ projectId, seat, replacing, excludeIds, onClose, onDone }: { projectId: number; seat: (typeof SEATS)[number]; replacing: boolean; excludeIds: number[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const users = useApi<any>(`/users?role=${seat.userRole}&active=true`);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/team`, { team_role: seat.role, user_id: Number(userId), reason: reason || null });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${replacing ? t('project.replace') : t('project.assign')}: ${t(`team_roles.${seat.role}`)}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!userId || busy} onClick={submit}>{t('common.save')}</button></>}
    >
      <div className="stack">
        <Field label={t('project.choose_user')}>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {(users.data?.users ?? []).filter((u: any) => !excludeIds.includes(u.id)).map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </Field>
        {replacing && (
          <Field label={t('project.change_reason')}>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        )}
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
