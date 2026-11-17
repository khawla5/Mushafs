import { Async, DualDate } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApi } from '../../lib/hooks';
import type { ProjectCtx } from '../ProjectPage';

/** RDR-05 (light phase 2): the reader's journey – recording length in months, reviews, first broadcast, publishing. */
export function JourneyTab({ ctx }: { ctx: ProjectCtx }) {
  const { t } = useI18n();
  const state = useApi<any>(`/projects/${ctx.data.project.id}/journey`);
  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <div className="card-head"><h2>{t('journey.title')}</h2></div>
      <Async state={state}>
        {(d) => (
          <ul className="timeline">
            {d.steps.map((s: any) => (
              <li key={s.key} className={s.at ? 'done' : ''}>
                <div className="t-title">{t(`journey.${s.key}`)}</div>
                <div className="t-meta">
                  {s.at ? <DualDate value={s.at} /> : t('journey.pending')}
                  {s.end && <> → <DualDate value={s.end} /></>}
                  {s.months !== null && s.months !== undefined && s.at && <> · {t('journey.length', { n: s.months })}</>}
                  {s.detail && <> · {s.detail}</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </section>
  );
}
