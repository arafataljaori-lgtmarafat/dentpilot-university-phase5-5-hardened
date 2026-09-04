import { useState, type FormEvent } from 'react';
import { api, type StudentListQuery } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pager, StatusBadge } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function StudentsPage() {
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const [draft, setDraft] = useState<StudentListQuery>({ page: 1, pageSize: 25 });
  const [filters, setFilters] = useState<StudentListQuery>({ page: 1, pageSize: 25 });
  const resource = useResource(() => api.students(filters), [filters]);
  const applyFilters = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); };

  return <>
    <PageHeader eyebrow="STUDENT DIRECTORY" title="دليل الطلاب" description="بحث وتصفية وترقيم صفحات ينفذها الخادم ضمن النطاق الأكاديمي المسموح." />
    <form className="surface filter-panel" onSubmit={applyFilters}><div className="filter-row"><Field label="بحث"><input value={draft.q ?? ''} onChange={(event) => setDraft({ ...draft, q: event.target.value || undefined })} placeholder="الاسم أو الرقم الجامعي" /></Field><Field label="القسم"><select value={draft.departmentId ?? ''} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value || undefined })}><option value="">كل الأقسام</option>{catalogs.data?.[0].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="السنة"><select value={draft.academicYearId ?? ''} onChange={(event) => setDraft({ ...draft, academicYearId: event.target.value || undefined })}><option value="">كل السنوات</option>{catalogs.data?.[1].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="المستوى"><select value={draft.academicLevelId ?? ''} onChange={(event) => setDraft({ ...draft, academicLevelId: event.target.value || undefined })}><option value="">كل المستويات</option>{catalogs.data?.[2].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="الدفعة"><select value={draft.cohortId ?? ''} onChange={(event) => setDraft({ ...draft, cohortId: event.target.value || undefined })}><option value="">كل الدفعات</option>{catalogs.data?.[3].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><button className="button primary" type="submit">تطبيق</button></div></form>
    {catalogs.loading || resource.loading ? <LoadingState /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data?.items.length ? <EmptyState title="لا توجد نتائج" description="لا توجد سجلات طلاب مطابقة ضمن نطاق الحساب." /> : <section className="surface"><DataTable><thead><tr><th>الطالب</th><th>الرقم الجامعي</th><th>التسجيل الحالي</th><th>الأقسام</th><th>الحالة</th><th /></tr></thead><tbody>{resource.data.items.map((student) => <tr key={student.id}><td><b>{student.displayName}</b><small className="block mono">{student.id}</small></td><td className="mono">{student.studentNumber}</td><td>{student.activeEnrollment ? <><StatusBadge value={student.activeEnrollment.status} /><small className="block">Revision {student.activeEnrollment.revision}</small></> : '—'}</td><td>{student.departmentIds.length}</td><td><StatusBadge value={student.status} /></td><td><button className="button ghost" onClick={() => navigate(`/students/${student.id}`)}>فتح الملف</button></td></tr>)}</tbody></DataTable><Pager {...resource.data.page} onPage={(page) => setFilters({ ...filters, page })} /></section>}
  </>;
}

export function StudentDetailPage({ id }: { id: string }) {
  const resource = useResource(() => api.student(id), [id]);
  return <>
    <button className="back-link" onClick={() => navigate('/students')}>← العودة إلى الطلاب</button>
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data ? null : <>
      <PageHeader eyebrow="STUDENT ACADEMIC PROFILE" title={resource.data.displayName} description={`الرقم الجامعي: ${resource.data.studentNumber}`} actions={<StatusBadge value={resource.data.status} />} />
      <section className="surface profile-summary"><dl><div><dt>Student ID</dt><dd className="mono">{resource.data.id}</dd></div><div><dt>College ID</dt><dd className="mono">{resource.data.collegeId}</dd></div><div><dt>Revision</dt><dd>{resource.data.revision}</dd></div><div><dt>التسجيلات</dt><dd>{resource.data.enrollments.length}</dd></div></dl></section>
      <section className="surface"><div className="surface-heading"><div><span className="eyebrow">ENROLLMENT HISTORY</span><h2>السجل الأكاديمي</h2></div></div>{resource.data.enrollments.length ? <div className="timeline">{resource.data.enrollments.map((enrollment) => <article key={enrollment.id}><span className="timeline-dot" /><div><header><StatusBadge value={enrollment.status} /><b className="mono">{enrollment.id}</b></header><p>بدأ: {new Date(enrollment.startedAt).toLocaleDateString('ar')} · Revision {enrollment.revision}</p><div className="mini-metrics"><span>Roster memberships <b>{enrollment.rosterMemberships.length}</b></span><span>Group memberships <b>{enrollment.groupMemberships.length}</b></span></div>{enrollment.closeReason ? <small>سبب الإغلاق: {enrollment.closeReason}</small> : null}</div></article>)}</div> : <EmptyState title="لا يوجد سجل تسجيل" description="لم يعُد الخادم تسجيلات مخولة لهذا الطالب." />}</section>
    </>}
  </>;
}
