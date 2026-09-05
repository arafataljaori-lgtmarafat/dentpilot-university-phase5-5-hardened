import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('ar-EG') : '—';
}

export function SupervisorDetailControlPage({ id }: { id: string }) {
  const supervisorRes = useResource(() => api.controlSupervisorDetail(id), [id]);
  const grantsRes = useResource(() => api.controlSupervisorGrants(id), [id]);

  if (supervisorRes.loading || grantsRes.loading) return <LoadingState label="جارٍ تحميل الملف الإداري…" />;
  if (supervisorRes.error) return <ErrorState error={supervisorRes.error} onRetry={supervisorRes.reload} />;
  if (grantsRes.error) return <ErrorState error={grantsRes.error} onRetry={grantsRes.reload} />;

  const supervisor = supervisorRes.data;
  if (!supervisor) return <EmptyState title="لا توجد بيانات للمشرف" description="لم يعُد الخادم ملفًا إداريًا لهذا المشرف ضمن نطاق الحساب." />;
  const grants = grantsRes.data?.items ?? [];

  return <>
    <button type="button" className="back-link" onClick={() => navigate('/control/supervisors')}>← العودة إلى دليل المشرفين</button>
    <PageHeader
      eyebrow="SUPERVISOR ADMINISTRATIVE PROFILE"
      title={supervisor.display_name}
      description="ملف إداري للقراءة فقط ضمن البيانات التي يعيدها الخادم."
      actions={<span className="read-only-label">قراءة فقط</span>}
    />

    <section className="profile-summary surface">
      <div><span>الاسم</span><strong>{supervisor.display_name}</strong></div>
      <div><span>البريد الإلكتروني</span><strong>{supervisor.email}</strong></div>
      <div><span>حالة الحساب</span><span className={`status-badge status-${supervisor.active ? 'active' : 'inactive'}`}>{supervisor.active ? 'نشط' : 'غير نشط'}</span></div>
    </section>

    <section className="surface">
      <div className="surface-heading"><div><span className="eyebrow">CURRENT GRANTS & SCOPE</span><h2>المنح والنطاقات الحالية</h2></div><span className="directory-count">{grants.length} سجل</span></div>
      {grants.length ? <DataTable><thead><tr><th>مجموعة الصلاحيات</th><th>القسم</th><th>التكليف</th><th>تاريخ المنح</th><th>تاريخ الإلغاء</th><th>الحالة</th></tr></thead><tbody>{grants.map((grant) => <tr key={grant.id}><td className="mono">{grant.permission_set_version_id}</td><td className="mono">{grant.department_id ?? '—'}</td><td className="mono">{grant.assignment_id}</td><td>{formatDate(grant.granted_at)}</td><td>{formatDate(grant.revoked_at)}</td><td><span className={`status-badge status-${grant.revoked_at ? 'inactive' : 'active'}`}>{grant.revoked_at ? 'ملغاة' : 'سارية'}</span></td></tr>)}</tbody></DataTable> : <EmptyState title="لا توجد منح حالية" description="لم يعُد الخادم منحًا أو نطاقات مرتبطة بهذا المشرف." />}
    </section>

    <section className="state-card empty-state supervisor-management-note"><h2>نطاق المرحلة</h2><p>إدارة الدعوات، تفعيل الحسابات، منح الصلاحيات، إلغاؤها، وتعيين المناوبات مؤجلة إلى مراحل لاحقة بعد تثبيت عقود Backend الخاصة بها.</p></section>
  </>;
}
