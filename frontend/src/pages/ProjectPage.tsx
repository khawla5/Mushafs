import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Async, ConfirmModal, ErrorBox, StatusBadge, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { useNotifications } from '../lib/notifications';
import { OverviewTab } from './project/OverviewTab';
import { SessionsTab } from './project/SessionsTab';
import { TeamTab } from './project/TeamTab';
import { RecordingTab } from './project/RecordingTab';
import { QualityTab } from './project/QualityTab';
import { FinalTab } from './project/FinalTab';
import { DistributionTab } from './project/DistributionTab';
import { GeneralNotesTab } from './project/GeneralNotesTab';
import { JourneyTab } from './project/JourneyTab';

export interface ProjectCtx {
  data: any;
  reload: () => Promise<void> | void;
}

const TABS = ['overview', 'sessions', 'team', 'recording', 'quality', 'final', 'distribution', 'general_notes', 'journey'] as const;
type Tab = (typeof TABS)[number];

export function ProjectPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { has } = useAuth();
  const toast = useToast();
  const { tick } = useNotifications();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab;
  const state = useApi<any>(`/projects/${id}`, [tick]);
  const [confirm, setConfirm] = useState<null | 'approve' | 'start' | 'complete' | 'cancel'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const act = async (action: 'approve' | 'start' | 'complete' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${id}/${action}`, action === 'cancel' ? { reason: null } : {});
      if (action === 'approve') toast(t('project.approved_msg', { n: state.data?.project.session_count }));
      if (action === 'start') toast(t('project.started_msg'));
      setConfirm(null);
      await state.reload(true);
    } catch (err) {
      setError(err);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Async state={state}>
      {(d) => {
        const p = d.project;
        const ctx: ProjectCtx = { data: d, reload: () => state.reload(true) };
        return (
          <>
            <div className="page-head">
              <div>
                <div className="crumbs"><Link to="/projects">{t('projects.title')}</Link> / <span className="num">{p.code}</span></div>
                <h1>{p.title}</h1>
                <div className="row" style={{ marginTop: 4 }}>
                  <StatusBadge status={p.status} />
                  <span className="badge badge-muted">{t(`project_type.${p.project_type}`)}</span>
                  <span className="muted">{p.riwayah} · {p.reader_name}</span>
                </div>
              </div>
              <div className="row">
                {p.status === 'pending_approval' && has('admin') && <button className="btn btn-gold" onClick={() => setConfirm('approve')}>{t('project.approve')}</button>}
                {p.status === 'approved' && has('admin', 'production_manager') && <button className="btn btn-primary" onClick={() => setConfirm('start')}>{t('project.start')}</button>}
                {p.status === 'distribution' && has('admin', 'production_manager') && <button className="btn btn-primary" onClick={() => setConfirm('complete')}>{t('project.complete')}</button>}
                {!['completed', 'cancelled'].includes(p.status) && has('admin') && <button className="btn btn-danger" onClick={() => setConfirm('cancel')}>{t('project.cancel_project')}</button>}
              </div>
            </div>
            {!!error && <div style={{ marginBottom: 12 }}><TeamError error={error} /></div>}
            <nav className="tabs" role="tablist">
              {TABS.map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setParams({ tab: k }, { replace: true })}>
                  {t(`project.${k}`)}
                </button>
              ))}
            </nav>
            {tab === 'overview' && <OverviewTab ctx={ctx} />}
            {tab === 'sessions' && <SessionsTab ctx={ctx} />}
            {tab === 'team' && <TeamTab ctx={ctx} />}
            {tab === 'recording' && <RecordingTab ctx={ctx} />}
            {tab === 'quality' && <QualityTab ctx={ctx} />}
            {tab === 'final' && <FinalTab ctx={ctx} />}
            {tab === 'distribution' && <DistributionTab ctx={ctx} />}
            {tab === 'general_notes' && <GeneralNotesTab ctx={ctx} />}
            {tab === 'journey' && <JourneyTab ctx={ctx} />}
            {confirm && (
              <ConfirmModal
                message={t(`project.confirm_${confirm}`)}
                busy={busy}
                danger={confirm === 'cancel'}
                onClose={() => setConfirm(null)}
                onConfirm={() => act(confirm)}
              />
            )}
          </>
        );
      }}
    </Async>
  );
}

/** Shows "team incomplete: mujiz, technician" with translated role names. */
function TeamError({ error }: { error: any }) {
  const { t } = useI18n();
  const missing: string[] | undefined = error?.details?.missing;
  if (error?.code === 'team_incomplete' && missing) {
    return <div className="alert-box error">{t('project.team_incomplete', { missing: missing.map((m) => t(`team_roles.${m}`)).join('، ') })}</div>;
  }
  return <ErrorBox error={error} />;
}
