import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { useAuth, type Role } from './lib/auth';
import { NotificationsProvider } from './lib/notifications';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectNewPage } from './pages/ProjectNewPage';
import { ProjectPage } from './pages/ProjectPage';
import { SessionPage } from './pages/SessionPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { NoteTypesPage } from './pages/admin/NoteTypesPage';
import { AuditPage } from './pages/admin/AuditPage';
import { NotFoundPage } from './pages/NotFoundPage';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { has } = useAuth();
  return has(...roles) ? <>{children}</> : <NotFoundPage />;
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <NotificationsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<RequireRole roles={['admin', 'production_manager']}><ProjectNewPage /></RequireRole>} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="sessions/:id" element={<SessionPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="reports" element={<RequireRole roles={['admin', 'supervisor', 'production_manager']}><ReportsPage /></RequireRole>} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="admin/users" element={<RequireRole roles={['admin']}><UsersPage /></RequireRole>} />
          <Route path="admin/settings" element={<RequireRole roles={['admin']}><SettingsPage /></RequireRole>} />
          <Route path="admin/note-types" element={<RequireRole roles={['admin']}><NoteTypesPage /></RequireRole>} />
          <Route path="admin/audit" element={<RequireRole roles={['admin', 'supervisor']}><AuditPage /></RequireRole>} />
          <Route path="login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </NotificationsProvider>
  );
}
