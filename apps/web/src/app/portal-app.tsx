import { useEffect, useState, type ReactNode } from 'react';
import type { AccountRole, SessionActorDto } from '@dentpilot/contracts';
import { useSession } from '../auth/session';
import { ErrorState, LoadingState, PageHeader } from '../components/ui';
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
import { ClinicalCaseDetailControlPage, ClinicalCaseRegistryControlPage, ClinicalReviewMonitoringControlPage } from '../features/control/clinical-operations-page';

interface NavigationItem { path: string; label: string; short: string; }
interface NavigationSection { label: string; items: NavigationItem[]; }

const universityAdminNavigation: NavigationSection[] = [
  { label: 'النظرة العامة', items: [{ path: '/dashboard', label: 'لوحة المتابعة', short: 'DB' }] },
  {
    label: 'البنية الأكاديمية',
    items: [
      { path: '/students', label: 'الطلاب', short: 'ST' },
      { path: '/departments', label: 'الأقسام والبرامج', short: 'DP' },
      { path: '/groups', label: 'المجموعات والتسجيلات', short: 'GR' },
    ],
  },
  {
    label: 'المشرفون والمناوبات',
    items: [
      { path: '/control/supervisors', label: 'دليل المشرفين', short: 'SV' },
      { path: '/control/schedules', label: 'المناوبات', short: 'SC' },
      { path: '/assignments', label: 'نطاقات الإشراف', short: 'AS' },
    ],
  },
  {
    label: 'العمليات السريرية',
    items: [
      { path: '/control/clinical-operations/cases', label: 'سجل الحالات والكاسشيتات', short: 'CS' },
      { path: '/control/clinical-operations/reviews', label: 'مراقبة المراجعات', short: 'RV' },
    ],
  },
  { label: 'التقارير والتدقيق', items: [{ path: '/reports', label: 'التقارير التشغيلية', short: 'RP' }] },
];

const supervisorNavigation: NavigationSection[] = [
  { label: 'العمليات السريرية', items: [{ path: '/supervisor', label: 'الرئيسية', short: 'HM' }, { path: '/supervisor/daily-sheet', label: 'اليوم والمناوبة', short: 'TD' }, { path: '/supervisor/queue', label: 'مراجعة الأعمال', short: 'RQ' }] },
  { label: 'السجل', items: [{ path: '/supervisor/history', label: 'السجل التاريخي', short: 'HI' }] },
  { label: 'التحليل', items: [{ path: '/supervisor/summary', label: 'ملخص أعمال المشرف', short: 'SM' }] },
];

const studentNavigation: NavigationSection[] = [
  { label: 'تجربة الطالب', items: [{ path: '/student', label: 'مساحة الطالب', short: 'ME' }] },
];

const roleLabels: Record<AccountRole, string> = {
  UNIVERSITY_ADMIN: 'مسؤول الجامعة',
  DEPARTMENT_ADMIN: 'دور قديم غير معتمد',
  CLINICAL_SUPERVISOR: 'مشرف سريري',
  STUDENT_INTEGRATION: 'طالب',
};

function navigationForRole(role: AccountRole): NavigationSection[] {
  if (role === 'UNIVERSITY_ADMIN') return universityAdminNavigation;
  if (role === 'CLINICAL_SUPERVISOR') return supervisorNavigation;
  if (role === 'STUDENT_INTEGRATION') return studentNavigation;
  return [];
}

function flattenNavigation(sections: NavigationSection[]): NavigationItem[] {
  return sections.flatMap((section) => section.items);
}

function StudentExperienceStatus() {
  return <section className="surface state-card">
    <PageHeader
      eyebrow="STUDENT EXPERIENCE"
      title="مساحة الطالب"
      description="تم فصل حساب الطالب عن مساحات الإدارة والمشرفين."
    />
    <div className="empty-state">
      <h2>الواجهة الطلابية قيد التجهيز</h2>
      <p>يدعم النظام حاليًا هوية الطالب ومسارات المسودات والتسليمات من جهة الخادم، بينما لم تُعتمد بعد صفحات تشغيلية طلابية كاملة في هذه المرحلة.</p>
      <p>لن تظهر لك أدوات الإدارة أو أدوات المشرف لأن صلاحيات الحساب يحددها الخادم، وليس التنقل في الواجهة.</p>
    </div>
  </section>;
}

function RetiredRoleStatus() {
  return <main className="boot-screen" dir="rtl">
    <div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>كلية طب الأسنان · جامعة الجزيرة</small></span></div>
    <section className="surface state-card">
      <PageHeader
        eyebrow="ROLE ALIGNMENT"
        title="هذا الدور غير معتمد في نموذج المنتج الحالي"
        description="يعمل DentPilot الآن بثلاث مساحات فقط: Control، المشرف السريري، والطالب. لا يوفّر هذا Portal مسارات تشغيلية لحساب مسؤول القسم القديم."
      />
      <p>تتطلب إزالة الدور نهائيًا من الحسابات والعقود والصلاحيات مرحلة Backend مستقلة ومضبوطة. لم تُجرَ أي تغييرات على صلاحيات الخادم هنا.</p>
    </section>
  </main>;
}

function pageFor(path: string, segments: string[], role: AccountRole): ReactNode {
  if (role === 'STUDENT_INTEGRATION') return path === '/student' ? <StudentExperienceStatus /> : null;
  if (path === '/dashboard') return <DashboardPage />;
  if (path === '/students') return <StudentsPage />;
  if (segments[0] === 'students' && segments[1]) return <StudentDetailPage id={segments[1]} />;
  if (path === '/departments') return <DepartmentsPage />;
  if (path === '/groups') return <GroupsPage />;
  if (path === '/assignments') return <AssignmentsPage />;
  if (path === '/control/clinical-operations/cases') return <ClinicalCaseRegistryControlPage />;
  if (path === '/control/clinical-operations/reviews') return <ClinicalReviewMonitoringControlPage />;
  if (segments[0] === 'control' && segments[1] === 'clinical-operations' && segments[2] === 'cases' && segments[3]) return <ClinicalCaseDetailControlPage id={segments[3]} />;
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
  if (path === '/student') return items.some((item) => item.path === '/student');
  if (path.startsWith('/students/')) return items.some((item) => item.path === '/students');
  if (path.startsWith('/control/clinical-operations/')) return items.some((item) => item.path === '/control/clinical-operations/cases' || item.path === '/control/clinical-operations/reviews');
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
  const navigation = navigationForRole(actor.role);
  const navigationItems = flattenNavigation(navigation);
  const defaultPath = navigationItems[0]?.path;
  const visible = routeIsVisible(location.path, navigationItems);

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

  const activeItem = [...navigationItems].sort((left, right) => right.path.length - left.path.length).find((item) => location.path === item.path || location.path.startsWith(`${item.path}/`));
  return <div className="portal-shell" dir="rtl">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="تنقل DentPilot الرئيسي">
      <div className="brand-lockup dark sidebar-brand"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>كلية طب الأسنان · جامعة الجزيرة</small></span></div>
      <nav aria-label="التنقل الرئيسي">
        {navigation.map((section) => <div className="nav-section" key={section.label}>
          <span className="nav-section-label">{section.label}</span>
          {section.items.map((item) => <button type="button" key={item.path} aria-current={activeItem?.path === item.path ? 'page' : undefined} className={activeItem?.path === item.path ? 'active' : ''} onClick={() => { navigate(item.path); setMenuOpen(false); }}><span>{item.short}</span>{item.label}</button>)}
        </div>)}
      </nav>
      <div className="sidebar-foot"><small>مصدر الصلاحيات</small><b>الخادم هو المرجع الوحيد</b></div>
    </aside>
    {menuOpen ? <button className="menu-backdrop" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} /> : null}
    <div className="portal-workspace">
      <header className="topbar">
        <div className="topbar-leading">
          <button type="button" className="mobile-menu" aria-label="فتح القائمة" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span aria-hidden="true">☰</span></button>
          <div className="context-title"><small>المساحة الحالية</small><b>{activeItem?.label ?? 'DentPilot'}</b></div>
        </div>
        <div className="actor-card"><span className="actor-avatar" aria-hidden="true">{actor.role.slice(0, 2)}</span><div><b>{roleLabels[actor.role]}</b><small>{actor.departmentIds.length ? `${actor.departmentIds.length} نطاق قسم` : 'نطاق المؤسسة'}</small></div><button type="button" className="button ghost" onClick={() => void session.logout()}>خروج</button></div>
      </header>
      <main id="page-content" className="page-content" tabIndex={-1}>{visible ? pageFor(location.path, location.segments, actor.role) : <LoadingState />}</main>
    </div>
  </div>;
}

export function PortalApp() {
  const session = useSession();
  if (session.status === 'loading') return <main className="boot-screen"><div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>كلية طب الأسنان · جامعة الجزيرة</small></span></div><LoadingState label="جارٍ استعادة الجلسة الآمنة…" /></main>;
  if (session.status === 'anonymous') return <LoginPage />;
  if (session.status === 'error') return <main className="boot-screen"><div className="brand-lockup dark"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>كلية طب الأسنان · جامعة الجزيرة</small></span></div><ErrorState error={session.error} onRetry={() => void session.refresh()} /></main>;
  if (session.actor.role === 'DEPARTMENT_ADMIN') return <RetiredRoleStatus />;
  return <PortalShell actor={session.actor} />;
}
