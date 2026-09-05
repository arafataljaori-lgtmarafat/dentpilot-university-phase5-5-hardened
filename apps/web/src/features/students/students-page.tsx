import { useState, type FormEvent } from 'react';
import { api, type StudentListQuery } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pager, StatusBadge } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function catalogLabel(items: Array<{ id: string; label?: string; name?: string }> | undefined, id: string | null | undefined): string {
  if (!id) return 'غير محدد';
  const item = items?.find((entry) => entry.id === id);
  return item?.name ?? item?.label ?? 'غير محدد';
}

function academicContext(
  enrollment: { academicYearId: string; academicLevelId: string; cohortId: string },
  catalogs: [
    Array<{ id: string; name: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
  ] | undefined,
) {
  return {
    year: catalogLabel(catalogs?.[1], enrollment.academicYearId),
    level: catalogLabel(catalogs?.[2], enrollment.academicLevelId),
    cohort: catalogLabel(catalogs?.[3], enrollment.cohortId),
  };
}

export function StudentsPage() {
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const [draft, setDraft] = useState<StudentListQuery>({ page: 1, pageSize: 25 });
  const [filters, setFilters] = useState<StudentListQuery>({ page: 1, pageSize: 25 });
  const resource = useResource(() => api.students(filters), [filters]);
  const applyFilters = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); };
  const catalogTuple = catalogs.data as [
    Array<{ id: string; name: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
  ] | undefined;

  return <>
    <PageHeader eyebrow="ACADEMIC STRUCTURE · CONTROL" title="دليل الطلاب" description="مرجع أكاديمي للطلاب ضمن النطاق المسموح، مع بحث وفلاتر وترقيم ينفذها الخادم." actions={<span className="read-only-label">قراءة أكاديمية · قراءة فقط</span>} />
    <form className="surface filter-panel" onSubmit={applyFilters} aria-label="فلاتر دليل الطلاب">
      <div className="filter-row">
        <Field label="بحث"><input value={draft.q ?? ''} onChange={(event) => setDraft({ ...draft, q: event.target.value || undefined })} placeholder="الاسم أو الرقم الجامعي" /></Field>
        <Field label="القسم"><select value={draft.departmentId ?? ''} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value || undefined })}><option value="">كل الأقسام</option>{catalogs.data?.[0].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="السنة الأكاديمية"><select value={draft.academicYearId ?? ''} onChange={(event) => setDraft({ ...draft, academicYearId: event.target.value || undefined })}><option value="">كل السنوات</option>{catalogs.data?.[1].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="المستوى"><select value={draft.academicLevelId ?? ''} onChange={(event) => setDraft({ ...draft, academicLevelId: event.target.value || undefined })}><option value="">كل المستويات</option>{catalogs.data?.[2].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="الدفعة"><select value={draft.cohortId ?? ''} onChange={(event) => setDraft({ ...draft, cohortId: event.target.value || undefined })}><option value="">كل الدفعات</option>{catalogs.data?.[3].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <button className="button primary" type="submit">تطبيق الفلاتر</button>
      </div>
      <small className="filter-help">الفلاتر المتاحة حاليًا: الاسم أو الرقم الجامعي، القسم، السنة الأكاديمية، المستوى، والدفعة.</small>
    </form>
    {catalogs.loading || resource.loading ? <LoadingState label="جارٍ تجهيز المرجع الأكاديمي للطلاب…" /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data?.items.length ? <EmptyState title="لا توجد نتائج" description="لا توجد سجلات طلاب مطابقة ضمن نطاق الحساب." /> : <section className="surface">
      <div className="surface-heading"><div><span className="eyebrow">ACADEMIC STUDENT DIRECTORY</span><h2>الطلاب ضمن النطاق</h2></div><span className="directory-count">{resource.data.page.total} سجل</span></div>
      <DataTable><thead><tr><th>الطالب</th><th>الرقم الجامعي</th><th>السياق الأكاديمي</th><th>القسم</th><th>التسجيل الحالي</th><th>الحالة الأكاديمية</th><th /></tr></thead><tbody>{resource.data.items.map((student) => {
        const enrollment = student.activeEnrollment;
        const context = enrollment ? academicContext(enrollment, catalogTuple) : undefined;
        return <tr key={student.id}>
          <td><b>{student.displayName}</b><small className="block mono">معرّف النظام: {student.id}</small></td>
          <td className="mono">{student.studentNumber}</td>
          <td>{context ? <div className="academic-context"><b>{context.year}</b><small>{context.level} · {context.cohort}</small></div> : <span className="muted">لا يوجد تسجيل نشط</span>}</td>
          <td>{student.departmentIds.length ? <div className="directory-department-list">{student.departmentIds.map((departmentId) => <span key={departmentId}>{catalogLabel(catalogs.data?.[0], departmentId)}</span>)}</div> : <span className="muted">غير محدد</span>}</td>
          <td>{enrollment ? <div className="registration-summary"><StatusBadge value={enrollment.status} /><small>بدأ في {formatDate(enrollment.startedAt)}</small></div> : <span className="muted">—</span>}</td>
          <td><StatusBadge value={student.status} /></td>
          <td><button className="button ghost" type="button" onClick={() => navigate(`/students/${student.id}`)}>فتح الملف الأكاديمي</button></td>
        </tr>;
      })}</tbody></DataTable>
      <Pager {...resource.data.page} onPage={(page) => setFilters({ ...filters, page })} />
    </section>}
  </>;
}

export function StudentDetailPage({ id }: { id: string }) {
  const resource = useResource(() => api.student(id), [id]);
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const catalogTuple = catalogs.data as [
    Array<{ id: string; name: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
    Array<{ id: string; label: string }>,
  ] | undefined;
  const activeEnrollment = resource.data?.enrollments.find((enrollment) => enrollment.status === 'ACTIVE') ?? resource.data?.enrollments[0];
  const activeContext = activeEnrollment ? academicContext(activeEnrollment, catalogTuple) : undefined;

  return <>
    <button className="back-link" type="button" onClick={() => navigate('/students')}>← العودة إلى دليل الطلاب</button>
    {resource.loading ? <LoadingState label="جارٍ تحميل الملف الأكاديمي…" /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data ? null : <>
      <PageHeader eyebrow="STUDENT ACADEMIC PROFILE" title={resource.data.displayName} description={`الرقم الجامعي: ${resource.data.studentNumber}`} actions={<StatusBadge value={resource.data.status} />} />
      {catalogs.error ? <div className="secondary-data-warning">تعذر تحميل المسميات الأكاديمية المساعدة؛ ستظل بيانات الملف الأساسية والتسجيلات متاحة.</div> : null}
      <div className="student-profile-grid">
        <section className="surface profile-summary"><div className="surface-heading"><div><span className="eyebrow">IDENTITY</span><h2>البيانات الأساسية</h2></div></div><dl><div><dt>الرقم الجامعي</dt><dd className="mono">{resource.data.studentNumber}</dd></div><div><dt>معرّف النظام</dt><dd className="mono">{resource.data.id}</dd></div><div><dt>الكلية</dt><dd className="mono">{resource.data.collegeId}</dd></div><div><dt>الإصدار</dt><dd>{resource.data.revision}</dd></div></dl></section>
        <section className="surface profile-summary"><div className="surface-heading"><div><span className="eyebrow">CURRENT ACADEMIC STATUS</span><h2>الحالة الأكاديمية الحالية</h2></div></div>{activeEnrollment && activeContext ? <div className="current-academic-card"><div><span>التسجيل الحالي</span><strong>{activeContext.year}</strong><small>{activeContext.level} · {activeContext.cohort}</small></div><StatusBadge value={activeEnrollment.status} /><p>بدأ التسجيل في {formatDate(activeEnrollment.startedAt)}</p></div> : <EmptyState title="لا يوجد تسجيل نشط" description="لم يعُد الخادم تسجيلًا أكاديميًا نشطًا لهذا الطالب ضمن النطاق الحالي." />}</section>
      </div>
      <section className="surface"><div className="surface-heading"><div><span className="eyebrow">ENROLLMENT HISTORY</span><h2>التسجيلات الأكاديمية</h2></div><span className="directory-count">{resource.data.enrollments.length} تسجيل</span></div>{resource.data.enrollments.length ? <div className="timeline">{resource.data.enrollments.map((enrollment) => {
        const context = academicContext(enrollment, catalogTuple);
        return <article key={enrollment.id}><span className="timeline-dot" /><div><header><div className="timeline-title"><StatusBadge value={enrollment.status} /><b>{context.year}</b></div><b className="mono">{enrollment.id}</b></header><p>{context.level} · {context.cohort} · بدأ في {formatDate(enrollment.startedAt)}{enrollment.closedAt ? ` · أُغلق في ${formatDate(enrollment.closedAt)}` : ''}</p><div className="mini-metrics"><span>عضويات القوائم <b>{enrollment.rosterMemberships.length}</b></span><span>عضويات المجموعات <b>{enrollment.groupMemberships.length}</b></span></div>{enrollment.closeReason ? <small className="block">سبب الإغلاق: {enrollment.closeReason}</small> : null}<div className="membership-summary">{enrollment.groupMemberships.length ? <div><strong>المجموعات المدعومة</strong>{enrollment.groupMemberships.map((membership) => <span key={membership.id} className="membership-chip"><span className="mono">{membership.groupId}</span><StatusBadge value={membership.status} /></span>)}</div> : null}{enrollment.rosterMemberships.length ? <div><strong>عضويات القوائم</strong>{enrollment.rosterMemberships.map((membership) => <span key={membership.id} className="membership-chip"><span className="mono">{membership.rosterId}</span><StatusBadge value={membership.status} /></span>)}</div> : null}</div></div></article>;
      })}</div> : <EmptyState title="لا يوجد سجل تسجيل" description="لم يعُد الخادم تسجيلات مخولة لهذا الطالب." />}</section>
    </>}
  </>;
}
