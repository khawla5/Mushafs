import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { DEMO } from '../demo/mode';
import { useAuth } from './auth';
import { useI18n } from '../i18n';
import { useToast } from '../components/ui';

export interface Notification {
  id: number;
  kind: string;
  params: Record<string, any>;
  link: string | null;
  project_id: number | null;
  read_at: string | null;
  created_at: string;
}

interface Ctx {
  items: Notification[];
  unread: number;
  reload: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAll: () => Promise<void>;
  /** Increments whenever a live notification arrives (pages can refresh on it). */
  tick: number;
}

const NotifCtx = createContext<Ctx | null>(null);

/** Translates a notification kind + params into a sentence. */
export function useNotificationText() {
  const { t } = useI18n();
  return (n: Notification) => {
    const p = { ...n.params };
    if (p.role) p.role = t(`team_roles.${p.role}`);
    if (p.round) p.round = t(`round.${p.round}`);
    if (p.stage) p.stage = t(`timer_stage.${p.stage}`);
    if (p.status) p.status = t(`attendance.${p.status}`);
    if (p.session === null || p.session === undefined) p.session = '—';
    return t(`notifications.kinds.${n.kind}`, p);
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const text = useNotificationText();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get<{ notifications: Notification[]; unread: number }>('/notifications');
      setItems(r.notifications);
      setUnread(r.unread);
    } catch { /* shown elsewhere */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    reload();
    // ADM-04: instant notifications through Server-Sent Events, with a polling fallback
    if (DEMO) return; // no live server in the static demo
    const es = new EventSource('/api/notifications/stream');
    es.addEventListener('notification', (e) => {
      try {
        const n = JSON.parse((e as MessageEvent).data) as Notification;
        setItems((xs) => [n, ...xs.filter((x) => x.id !== n.id)].slice(0, 100));
        setUnread((u) => u + 1);
        setTick((x) => x + 1);
        toast(text(n), 'info');
      } catch { /* ignore malformed */ }
    });
    const poll = setInterval(reload, 60_000);
    return () => {
      es.close();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = useCallback(async (id: number) => {
    await api.post(`/notifications/${id}/read`);
    setItems((xs) => xs.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAll = useCallback(async () => {
    await api.post('/notifications/read-all');
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  }, []);

  return <NotifCtx.Provider value={{ items, unread, reload, markRead, markAll, tick }}>{children}</NotifCtx.Provider>;
}

export function useNotifications() {
  const v = useContext(NotifCtx);
  if (!v) throw new Error('useNotifications outside provider');
  return v;
}
