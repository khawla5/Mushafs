import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/ui';
import { useI18n } from '../i18n';
import { dual, relative } from '../lib/format';
import { useNotifications, useNotificationText } from '../lib/notifications';

export function NotificationsPage() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { items, unread, reload, markRead, markAll } = useNotifications();
  const text = useNotificationText();

  useEffect(() => { reload(); }, [reload]);

  return (
    <>
      <div className="page-head">
        <h1>{t('notifications.title')}</h1>
        {unread > 0 && <button className="btn" onClick={markAll}>{t('notifications.mark_all')}</button>}
      </div>
      <section className="card">
        {items.length ? (
          <div className="work-list">
            {items.map((n) => (
              <button
                key={n.id}
                className="work-item"
                style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', font: 'inherit', textAlign: 'start', cursor: 'pointer' }}
                onClick={async () => {
                  if (!n.read_at) await markRead(n.id);
                  if (n.link) nav(n.link);
                }}
              >
                {!n.read_at ? <span className="dot dot-unread" /> : <span className="dot" />}
                <div style={{ flex: 1 }}>
                  <div className="title" style={{ fontWeight: n.read_at ? 400 : 600 }}>{text(n)}</div>
                  <div className="meta" title={dual(n.created_at, locale, true)}>{relative(n.created_at, locale)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : <Empty>{t('notifications.none')}</Empty>}
      </section>
    </>
  );
}
