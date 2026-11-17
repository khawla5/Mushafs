import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { dual } from '../lib/format';
import { Icon } from './Icon';

// ------------------------------------------------------------------ states
export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <div className="spinner" /> {t('common.loading')}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  if (!error) return null;
  return (
    <div className="alert-box error row-between" role="alert">
      <span>{errorText(error)}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="empty">{children ?? t('common.empty')}</div>;
}

/** Renders loading / error / content for a useApi result. */
export function Async<T>({ state, children }: { state: { data: T | null; error: unknown; loading: boolean; reload: () => void }; children: (data: T) => ReactNode }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error && !state.data) return <ErrorBox error={state.error} onRetry={() => state.reload()} />;
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}

// ------------------------------------------------------------------ badges
export function StageBadge({ stage }: { stage: string }) {
  const { t } = useI18n();
  return <span className={`stage st-${stage}`}>{t(`stage.${stage}`)}</span>;
}

export function AlertDot({ level }: { level: number | null | undefined }) {
  const { t } = useI18n();
  if (!level) return null;
  return <span className={`dot ${level === 1 ? 'dot-orange' : 'dot-red'}`} title={t(`alert.${level}`)} aria-label={t(`alert.${level}`)} />;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const cls = status === 'completed' ? 'badge-ok' : status === 'cancelled' ? 'badge-muted' : status === 'pending_approval' ? 'badge-gold' : 'badge-info';
  return <span className={`badge ${cls}`}>{t(`project_status.${status}`)}</span>;
}

export function DualDate({ value, time = false }: { value: string | Date | null | undefined; time?: boolean }) {
  const { locale } = useI18n();
  return <span className="num">{dual(value, locale, time)}</span>;
}

// ------------------------------------------------------------------ form field
export function Field({ label, hint, error, children, full }: { label: string; hint?: string; error?: string | null; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Maps zod validation details from the API to { field: message }. */
export function fieldErrors(err: any): Record<string, string> {
  const out: Record<string, string> = {};
  const details = err?.details;
  if (Array.isArray(details)) for (const d of details) if (d?.path) out[d.path] = d.message;
  return out;
}

// ------------------------------------------------------------------ modal
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ message, onConfirm, onClose, busy, danger }: { message: string; onConfirm: () => void; onClose: () => void; busy?: boolean; danger?: boolean }) {
  const { t } = useI18n();
  return (
    <Modal
      title={t('common.confirm')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{t('common.confirm')}</button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts
interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ misc
export function Weekdays({ value, onChange, disabled }: { value: number[]; onChange?: (v: number[]) => void; disabled?: boolean }) {
  const { tr } = useI18n();
  const names = tr<string[]>('weekdays');
  return (
    <div className="chips">
      {names.map((n, i) => (
        <button
          type="button"
          key={i}
          disabled={disabled || !onChange}
          className={`chip-toggle${value.includes(i) ? ' on' : ''}`}
          onClick={() => onChange?.(value.includes(i) ? value.filter((d) => d !== i) : [...value, i].sort())}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ parts, total }: { parts: { value: number; color: string; label?: string }[]; total: number }) {
  return (
    <div className="progress-bar" role="img" aria-label={parts.map((p) => `${p.label ?? ''} ${p.value}/${total}`).join(', ')}>
      {parts.map((p, i) => <span key={i} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, background: p.color }} />)}
    </div>
  );
}
