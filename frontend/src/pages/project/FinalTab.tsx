import { useEffect, useMemo, useState } from 'react';
import { Async, Empty, ErrorBox, Field, useToast } from '../../components/ui';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

const SPLITS = { whole: 1, half: 2, third: 3, quarter: 4 } as const;
type Split = keyof typeof SPLITS;

/** Even contiguous ranges covering 1..n. */
function ranges(n: number, parts: number) {
  const out: { from: number; to: number }[] = [];
  let start = 1;
  for (let i = 0; i < parts; i++) {
    const size = Math.floor(n / parts) + (i < n % parts ? 1 : 0);
    out.push({ from: start, to: start + size - 1 });
    start += size;
  }
  return out;
}

/** REV-08: split the final review across reviewers (whole, half, third, quarter), every session covered. */
export function FinalTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const { has } = useAuth();
  const toast = useToast();
  const p = ctx.data.project;
  const stats = ctx.data.stats;
  const assignments = useApi<any>(`/projects/${p.id}/final-review`, [ctx.data]);
  const canSetup = has('admin', 'production_manager') && p.status === 'mixing';
  const reviewers = useApi<any>(canSetup ? '/users?role=reviewer&active=true' : null);
  const [split, setSplit] = useState<Split>('whole');
  const parts = useMemo(() => ranges(p.session_count, SPLITS[split]), [p.session_count, split]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setPicked((x) => parts.map((_, i) => x[i] ?? '')), [parts]);

  const allMixed = stats.mixed === stats.total;
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${p.id}/final-review`, { split, parts: parts.map((r, i) => ({ reviewer_id: Number(picked[i]), from: r.from, to: r.to })) });
      toast(t('final.started'));
      await ctx.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-2">
      {canSetup && (
        <section className="card">
          <div className="card-head"><h2>{t('final.title')}</h2></div>
          {!allMixed ? <div className="alert-box info">{t('final.not_ready')}</div> : (
            <div className="stack">
              <div className="segmented" role="radiogroup" aria-label={t('final.split')}>
                {(Object.keys(SPLITS) as Split[]).map((s) => (
                  <button key={s} className={split === s ? 'on' : ''} onClick={() => setSplit(s)}>{t(`final.${s}`)}</button>
                ))}
              </div>
              {parts.map((r, i) => (
                <Field key={i} label={`${t('final.part', { n: i + 1 })} · ${t('final.sessions_range', r)}`}>
                  <select className="input" value={picked[i] ?? ''} onChange={(e) => setPicked((x) => x.map((v, j) => (j === i ? e.target.value : v)))}>
                    <option value="">{t('project.choose_user')}</option>
                    {(reviewers.data?.users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </Field>
              ))}
              <ErrorBox error={error} />
              <button className="btn btn-primary" disabled={busy || picked.some((x) => !x)} onClick={start}>{t('final.start')}</button>
            </div>
          )}
        </section>
      )}
      <section className="card">
        <div className="card-head"><h2>{t('project.final')}</h2></div>
        <Async state={assignments}>
          {(d) => d.assignments.length ? (
            <div className="stack" style={{ gap: 0 }}>
              {d.assignments.map((a: any) => (
                <div key={a.id} className="work-item" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div className="title">{a.reviewer_name}</div>
                    <div className="meta">{t(`final.${a.split_label}`)} · {t('final.sessions_range', { from: a.session_from, to: a.session_to })}</div>
                  </div>
                  <span className={`badge ${a.submitted === a.total ? 'badge-ok' : 'badge-info'}`}>{t('final.progress', { done: a.submitted, total: a.total })}</span>
                </div>
              ))}
            </div>
          ) : <Empty>{p.status === 'mixing' || ['recording', 'approved'].includes(p.status) ? t('final.not_ready') : t('common.empty')}</Empty>}
        </Async>
      </section>
    </div>
  );
}
