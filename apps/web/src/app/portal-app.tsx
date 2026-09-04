import { useEffect, useState, type ReactNode } from 'react';
import type { AccountRole, SessionActorDto } from '@dentpilot/contracts';
import { useSession } from '../auth/session';
import { ErrorState, LoadingState } from '../components/ui';
import { AssignmentsPage } from '../features/assignments/assignments-page';
import { LoginPage } from '../features/auth/login-page';
import { DepartmentsPage, GroupsPage } from '../features/catalogs/catalog-pages';
import { DashboardPage } from '../features/dashboard/dashboard-page';
import { ReportsPage } from '../features/reports/reports-page';
import { StudentDetailPage, StudentsPage } from '../features/students/students-page';
import { SubmissionDetailPage, SubmissionsPage } from '../features/submissions/submissions-page';
import { navigate, useHashRoute } from '../routing/hash-router';
import { SupervisorWorkspace } from '../features/supervisor/supervisor-workspace';
import { SupervisorListControlPage } from '../features/control/supervisor-list-page';
import { SupervisorDetailControlPage } from '../features/control/supervisor-detail-page';
import { SchedulesControlPage, ScheduleDetailControlPage } from '../features/control/schedule-management-page';

interface NavigationItem { path: string; label: string; short: string; }

const adminNavigation: NavigationItem[] = [
  { path: '/dashboard', label: 'لوحة المتابعة', short: 'DB' },
  { path: '/students', label: 'الطلاب', short: 'ST' },
  { path: '/departments', label: 'الأقسام', short: 'DP' },
  { path: '/groups', label: 'المجموعات', short: 'GR' },
  { path: '/assignments', label: 'تكليفات المشرفين', short: 'AS' },
  { path: '/control/supervisors', label: 'إدارة المشرفين', short: 'SV' },
  { path: '/control/schedules', label: 'الجداول الزمنية', short: 'SC' },
  { path: '/submissions', label: 'التسليمات', short: 'SB' },
  { path: '/reviews', label: 'المراجعات', short: 'RV' },
  { path: '/reports', label: 'التقارير', short: 'RP' },
];

const supervisorNavigation: NavigationItem[] = [
  { path: '/supervisor', label: 'المساحة السريرية', short: 'CS' },
];

const roleLabels: Record<AccountRole, string> = {
  UNIVERSITY_ADMIN: 'مسؤول الجامعة',
  DEPARTMENT_ADMIN: 'مسؤول القسم',
  CLINICAL_SUPERVISOR: 'مشرف سريري',
  STUDENT_INTEGRATION: 'تكامل الطلاب',
};

function pageFor(path: string, segments: string[]): ReactNode {
  if (path === '/dashboard') return <DashboardPage />;
  if (path === '/students') return <StudentsPage />;
  if (segments[0] === 'students' && segments[1]) return <StudentDetailPage id={segments[1]} />;
  if (path === '/departments') return <DepartmentsPage />;
  if (path === '/groups') return <GroupsPage />;
  if (path === '/assignments') return <AssignmentsPage />;
  if (path === '/submissions') return <SubmissionsPage />;
  if (path === '/reviews') return <SubmissionsPage reviewQueue />;
  if (segments[0] === 'submissions' && segments[1]) return <SubmissionDetailPage id={segments[1]} />;
  if (path === '/reports') return <ReportsPage />;
  if (path === '/control/supervisors') return <SupervisorListControlPage />;
  if (segments[0] === 'control' && segments[1] === 'supervisors' && segments[2]) return <SupervisorDetailControlPage id={segments[2]} />;
  if (path === '/control/schedules') return <SchedulesControlPage />;
  if (segments[0] === 'control' && segments[1] === 'schedules' && segments[2]) return <ScheduleDetailControlPage id={segments[2]} />;
  if (path === '/supervisor' || path.startsWith('/supervisor/')) return <SupervisorWorkspace />;
  return null;
}

function routeIsVisible(path: string, items: NavigationItem[]): boolean {
  if (items.some((item) => item.path === path)) return true;
  if (path.startsWith('/students/')) return items.some((item) => item.path === '/students');
  if (path.startsWith('/submissions/')) return items.some((item) => item.path === '/submissions' || item.path === '/reviews');
  if (path.startsWith('/control/supervisors/')) return items.some((item) => item.path === '/control/supervisors');
  if (path.startsWith('/control/schedules/')) return items.some((item) => item.path === '/control/schedules');
  if (path.startsWith('/supervisor/')) return items.some((item) => item.path === '/supervisor');
  return false;
}

function PortalShell({ actor }: { actor: SessionActorDto }) {
  const session = useSession();
  const location = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = actor.role === 'CLINICAL_SUPERVISOR' ? supervisorNavigation : adminNavigation;
  const defaultPath = navigation[0]?.path;
  const visible = routeIsVisible(location.path, navigation);

  useEffect(() => {
    if (!visible && defaultPath) navigate(defaultPath);
  }, [defaultPath, visible]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    document.getElementById('page-content')?.focus();
  }, [location.path]);

  const activeItem = navigation.find((item) => location.path === item.path || location.path.startsWith(`${item.path}/`));
  return <div className="portal-shell" dir="rtl">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>University Portal</small></span></div>
      <nav aria-label="التنقل الرئيسي">{navigation.map((item) => <button type="button" key={item.path} aria-current={activeItem?.path === item.path ? 'page' : undefined} className={activeItem?.path === item.path ? 'active' : ''} onClick={() => { navigate(item.path); setMenuOpen(false); }}><span>{item.short}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><small>Production API</small><b>Server authoritative</b></div>
    </aside>
    {menuOpen ? <button className="menu-backdrop" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} /> : null}
    <div className="portal-workspace">
      <header className="topbar">
        <button type="button" className="mobile-menu" aria-label="فتح القائمة" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button>
        <div className="context-title"><small>المساحة الحالية</small><b>{activeItem?.label ?? 'DentPilot'}</b></div>
        <div className="actor-card"><span className="actor-avatar">{actor.role.slice(0, 2)}</span><div><b>{roleLabels[actor.role]}</b><small>{actor.departmentIds.length ? `${actor.departmentIds.length} نطاق قسم` : 'نطاق المؤسسة'}</small></div><button type="button" className="button ghost" onClick={() => void session.logout()}>خروج</button></div>
      </header>
      <main id="page-content" className="page-content" tabIndex={-1}>{visible ? pageFor(location.path, location.segments) : <LoadingState />}</main>
    </div>
  </div>;
}

export function PortalApp() {
  const session = useSession();
  if (session.status === 'loading') return <main className="boot-screen"><div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>University Portal</small></span></div><LoadingState label="جارٍ استعادة الجلسة الآمنة…" /></main>;
  if (session.status === 'anonymous') return <LoginPage />;
  if (session.status === 'error') return <main className="boot-screen"><div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>University Portal</small></span></div><ErrorState error={session.error} onRetry={() => void session.refresh()} /></main>;
  return <PortalShell actor={session.actor} />;
}
