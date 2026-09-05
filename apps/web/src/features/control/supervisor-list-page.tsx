import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, Field, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SupervisorListControlPage() {
  const { data, error, loading, reload } = useResource(() => api.controlSupervisors(), []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const supervisors = data?.items ?? [];
  const visibleSupervisors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return supervisors.filter((supervisor) => {
      const matchesQuery = !normalizedQuery
        || supervisor.display_name.toLocaleLowerCase().includes(normalizedQuery)
        || supervisor.email.toLocaleLowerCase().includes(normalizedQuery);
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? supervisor.active : !supervisor.active);
      return matchesQuery && matchesStatus;
    });
  }, [query, status, supervisors]);

  if (loading) return <LoadingState label="جارٍ تحميل دليل المشرفين…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return <>
    <PageHeader
      eyebrow="SUPERVISORS · CONTROL"
      title="دليل المشرفين"
      description="دليل إداري للقراءة فقط ضمن نطاق الحساب المخول من الخادم."
      actions={<span className="read-only-label">قراءة فقط</span>}
    />

    <section className="surface filter-panel" aria-label="فلاتر دليل المشرفين">
      <div className="filter-row">
        <Field label="بحث"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم المشرف أو البريد الإلكتروني" /></Field>
        <Field label="حالة الحساب"><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ALL">كل الحالات</option><option value="ACTIVE">نشط</option><option value="INACTIVE">غير نشط</option></select></Field>
      </div>
      <small className="filter-help">البحث والحالة متاحان من البيانات الحالية. نطاق القسم والمنح يفرضهما الخادم وتظهر تفاصيلهما داخل الملف الإداري.</small>
    </section>

    {!supervisors.length ? <EmptyState title="لا يوجد مشرفون" description="لم يعُد الخادم مشرفين ضمن نطاق الحساب الحالي." /> : !visibleSupervisors.length ? <EmptyState title="لا توجد نتائج مطابقة" description="غيّر عبارة البحث أو حالة الحساب لعرض نتائج أخرى." /> : <section className="surface">
      <div className="surface-heading"><div><span className="eyebrow">READ-ONLY DIRECTORY</span><h2>المشرفون ضمن النطاق</h2></div><span className="directory-count">{visibleSupervisors.length} من {supervisors.length}</span></div>
      <div className="table-wrap"><table><thead><tr><th>المشرف</th><th>البريد الإلكتروني</th><th>الحالة</th><th /></tr></thead><tbody>{visibleSupervisors.map((supervisor) => <tr key={supervisor.id}><td><b>{supervisor.display_name}</b><small className="block mono">{supervisor.id}</small></td><td>{supervisor.email}</td><td><span className={`status-badge status-${supervisor.active ? 'active' : 'inactive'}`}>{supervisor.active ? 'نشط' : 'غير نشط'}</span></td><td><button type="button" className="button ghost small" onClick={() => navigate(`/control/supervisors/${supervisor.id}`)}>فتح الملف الإداري</button></td></tr>)}</tbody></table></div>
    </section>}
  </>;
}
