import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { DEMO } from '../demo/mode';
import { useI18n } from '../i18n';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { Icon } from './Icon';

// Loaded only in the static demo build; removed from the normal bundle.
const DemoBar = DEMO ? lazy(() => import('./DemoBar').then((m) => ({ default: m.DemoBar }))) : null;
// Development-only role switcher for the real app; removed from production builds.
const DevRoleBar = import.meta.env.DEV && !DEMO ? lazy(() => import('./DevRoleBar').then((m) => ({ default: m.DevRoleBar }))) : null;

/**
 * Top navigation: a floating pill bar with every section that the old sidebar had —
 * main sections, then (after a divider) administration — and the user, language
 * and sign-out on the end. On narrow screens the pills scroll sideways.
 */
export function Layout() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout, has, isManagement } = useAuth();
  const { unread } = useNotifications();

  const pill = (to: string, icon: string, label: string, badge?: number) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `pill${isActive ? ' active' : ''}`}>
      <span className="pill-icon"><Icon name={icon} size={17} /></span>
      <span>{label}</span>
      {badge ? <span className="badge badge-count">{badge}</span> : null}
    </NavLink>
  );

  const showAdmin = has('admin') || has('supervisor');

  return (
    <div className="app">
      {DemoBar && <Suspense fallback={null}><DemoBar /></Suspense>}
      {DevRoleBar && <Suspense fallback={null}><DevRoleBar /></Suspense>}
      <header className="topnav" aria-label="navigation">
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="book" size={19} /></span>
          <span>
            <span className="brand-name" style={{ display: 'block' }}>{t('app.name')}</span>
            <span className="brand-motto">{t('app.motto')}</span>
          </span>
        </Link>

        <nav className="pills">
          {pill('/', 'home', t('nav.home'))}
          {pill('/projects', 'folder', t('nav.projects'))}
          {pill('/dashboard', 'chart', t('nav.dashboard'))}
          {isManagement && pill('/reports', 'report', t('nav.reports'))}
          {pill('/notifications', 'bell', t('nav.notifications'), unread)}
          {pill('/profile', 'user', t('nav.profile'))}
          {showAdmin && (
            <>
              <span className="pill-divider" role="separator" aria-label={t('nav.admin')} />
              {has('admin') && pill('/admin/users', 'users', t('nav.users'))}
              {has('admin') && pill('/admin/settings', 'settings', t('nav.settings'))}
              {has('admin') && pill('/admin/note-types', 'tag', t('nav.note_types'))}
              {pill('/admin/audit', 'shield', t('nav.audit'))}
            </>
          )}
        </nav>

        <div className="nav-actions">
          <div className="user-chip" title={user?.roles.map((r) => t(`roles.${r}`)).join('، ')}>
            <span className="avatar"><Icon name="user" size={17} /></span>
            <span className="user-text">
              <strong>{user?.full_name}</strong>
              <small>{user?.roles.map((r) => t(`roles.${r}`)).join('، ')}</small>
            </span>
          </div>
          <button className="round-btn" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} title={t('common.language')} aria-label={t('common.language')}>
            <Icon name="globe" size={18} />
          </button>
          {!DEMO && (
            <button className="round-btn" onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}>
              <Icon name="logout" size={18} />
            </button>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      {/* Al-Muzzammil 73:4 */}
      <footer className="verse-footer" lang="ar" dir="rtl">
        وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا
        <small>{t('app.quote_source')}</small>
      </footer>
    </div>
  );
}
