import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, StatusBadge } from '../../components/ui';

export function DepartmentsPage() {
  const resource = useResource(() => api.departments(), []);
  return <>
    <PageHeader eyebrow="ACADEMIC STRUCTURE" title="الأقسام" description="دليل الأقسام الذي يسمح الخادم للحساب الحالي بعرضه." />
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data?.length ? <EmptyState title="لا توجد أقسام" description="لا توجد أقسام ضمن نطاق الحساب الحالي." /> : <section className="card-grid">{resource.data.map((department) => <article className="catalog-card" key={department.id}><span className="catalog-code">{department.code}</span><h2>{department.name}</h2><p>College ID: <b className="mono">{department.collegeId}</b></p><footer><StatusBadge value={department.active ? 'ACTIVE' : 'ARCHIVED'} /><span>Revision {department.revision}</span></footer></article>)}</section>}
  </>;
}

export function GroupsPage() {
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels()]), []);
  const [departmentId, setDepartmentId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [academicLevelId, setAcademicLevelId] = useState('');

  useEffect(() => {
    if (!departmentId && catalogs.data?.[0].length) setDepartmentId(catalogs.data[0][0].id);
    if (!academicYearId && catalogs.data?.[1].length) setAcademicYearId(catalogs.data[1].find((year) => year.status === 'ACTIVE')?.id ?? catalogs.data[1][0].id);
  }, [academicYearId, catalogs.data, departmentId]);

  const resource = useResource(
    () => api.groups({ departmentId: departmentId || undefined, academicYearId: academicYearId || undefined, academicLevelId: academicLevelId || undefined }),
    [departmentId, academicYearId, academicLevelId],
  );

  return <>
    <PageHeader eyebrow="ACADEMIC GROUPS" title="المجموعات الأكاديمية" description="قائمة خادمية مقيدة بالقسم والسنة والمستوى." />
    <section className="surface filter-panel"><div className="filter-row"><Field label="القسم"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">كل الأقسام</option>{catalogs.data?.[0].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="السنة"><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="">كل السنوات</option>{catalogs.data?.[1].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="المستوى"><select value={academicLevelId} onChange={(event) => setAcademicLevelId(event.target.value)}><option value="">كل المستويات</option>{catalogs.data?.[2].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div></section>
    {catalogs.loading || resource.loading ? <LoadingState /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data?.length ? <EmptyState title="لا توجد مجموعات" description="لم يعُد الخادم مجموعات ضمن النطاق الحالي." /> : <section className="surface"><DataTable><thead><tr><th>المجموعة</th><th>النطاق الرقمي</th><th>القسم</th><th>المستوى</th><th>الحالة</th><th>Revision</th></tr></thead><tbody>{resource.data.map((group) => <tr key={group.id}><td><b>{group.name}</b><small className="block mono">{group.id}</small></td><td>{group.rangeStart ?? '—'} — {group.rangeEnd ?? '—'}</td><td>{catalogs.data?.[0].find((item) => item.id === group.departmentId)?.name ?? group.departmentId}</td><td>{catalogs.data?.[2].find((item) => item.id === group.academicLevelId)?.label ?? group.academicLevelId}</td><td><StatusBadge value={group.status} /></td><td>{group.revision}</td></tr>)}</tbody></DataTable></section>}
  </>;
}
