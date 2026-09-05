import { useState, type ReactNode } from 'react';
import type { AcademicLevelDto, AcademicYearDto, CohortDto, DepartmentDto, SubmissionDetailDto, SubmissionListItemDto, SubmissionStatus } from '@dentpilot/contracts';
import { api, type SubmissionListQuery } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pager, StatusBadge } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

const statuses: SubmissionStatus[] = ['SUBMITTED', 'REVISION_REQUESTED', 'APPROVED_START', 'APPROVED_FINAL', 'GRADED'];
const statusLabels: Record<SubmissionStatus, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مرسل للمراجعة',
  REVISION_REQUESTED: 'مطلوب تعديله',
  APPROVED_START: 'بدأ معتمدًا',
  APPROVED_FINAL: 'منتهٍ معتمدًا',
  GRADED: 'مقيّم',
};
type Catalogs = [DepartmentDto[], AcademicYearDto[], AcademicLevelDto[], CohortDto[]];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function catalogLabel(items: Array<{ id: string; label?: string; name?: string }> | undefined, id: string | null | undefined): string {
  if (!id) return 'غير محدد';
  const item = items?.find((entry) => entry.id === id);
  return item?.name ?? item?.label ?? 'غير محدد';
}

function academicContext(item: Pick<SubmissionListItemDto, 'academicYearId' | 'academicLevelId' | 'cohortId'>, catalogs: Catalogs | undefined) {
  return {
    year: catalogLabel(catalogs?.[1], item.academicYearId),
    level: catalogLabel(catalogs?.[2], item.academicLevelId),
    cohort: catalogLabel(catalogs?.[3], item.cohortId),
  };
}

function CatalogWarning({ loading = false }: { loading?: boolean }) {
  return <div className="secondary-data-warning">{loading ? 'جارٍ تحميل المسميات الأكاديمية المساعدة؛ سيظهر السجل عند توفر البيانات الأساسية.' : 'تعذر تحميل المسميات الأكاديمية المساعدة؛ سيظهر السجل بالمعرفات المتاحة فقط.'}</div>;
}

function ClinicalOperationsFilters({ filters, setFilters, departments, academicYears, academicLevels, cohorts }: { filters: SubmissionListQuery; setFilters: (next: SubmissionListQuery) => void; departments: Awaited<ReturnType<typeof api.departments>>; academicYears: Awaited<ReturnType<typeof api.academicYears>>; academicLevels: Awaited<ReturnType<typeof api.academicLevels>>; cohorts: Awaited<ReturnType<typeof api.cohorts>> }) {
  return <section className="surface filter-panel"><div className="filter-row">
    <Field label="القسم"><select value={filters.departmentId ?? ''} onChange={(event) => setFilters({ ...filters, departmentId: event.target.value || undefined, page: 1 })}><option value="">كل الأقسام</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="السنة الأكاديمية"><select value={filters.academicYearId ?? ''} onChange={(event) => setFilters({ ...filters, academicYearId: event.target.value || undefined, page: 1 })}><option value="">كل السنوات</option>{academicYears.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    <Field label="المستوى"><select value={filters.academicLevelId ?? ''} onChange={(event) => setFilters({ ...filters, academicLevelId: event.target.value || undefined, page: 1 })}><option value="">كل المستويات</option>{academicLevels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    <Field label="الدفعة"><select value={filters.cohortId ?? ''} onChange={(event) => setFilters({ ...filters, cohortId: event.target.value || undefined, page: 1 })}><option value="">كل الدفعات</option>{cohorts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    <Field label="الحالة"><select value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as SubmissionStatus | undefined, page: 1 })}><option value="">كل الحالات</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field>
  </div><small className="filter-help">الفلاتر المعروضة هي الفلاتر الموجودة في عقد الحالات الحالي. لا يوجد بحث نصي خادمي في هذا العقد.</small></section>;
}

function SubmissionRegistryTable({ items, catalogs, reviewMode }: { items: SubmissionListItemDto[]; catalogs: Catalogs | undefined; reviewMode: boolean }) {
  return <DataTable><thead><tr><th>الحالة</th><th>الطالب</th><th>القسم والسياق الأكاديمي</th><th>تاريخ الإرسال</th><th>المشرف المرتبط</th><th /></tr></thead><tbody>{items.map((item) => {
    const context = academicContext(item, catalogs);
    return <tr key={item.id}>
      <td><b>{item.caseSheetId}</b><small className="block mono">تسلسل {item.sequence}</small><StatusBadge value={item.status} /></td>
      <td><b>{item.studentDisplayName}</b><small className="block mono">{item.studentNumber}</small></td>
      <td><div className="academic-context"><b>{catalogLabel(catalogs?.[0], item.departmentId)}</b><small>{context.year} · {context.level} · {context.cohort}</small></div></td>
      <td>{formatDate(item.submittedAt)}</td>
      <td className="mono">{item.supervisorAssignmentId ?? '—'}</td>
      <td><button type="button" className="button ghost small" onClick={() => navigate(`/control/clinical-operations/cases/${item.id}`)}>عرض الحالة</button>{reviewMode ? <small className="block muted">متابعة إدارية فقط</small> : null}</td>
    </tr>;
  })}</tbody></DataTable>;
}

function ClinicalCaseListPage({ reviewMode = false }: { reviewMode?: boolean }) {
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const [filters, setFilters] = useState<SubmissionListQuery>({ page: 1, pageSize: 25, ...(reviewMode ? { status: 'SUBMITTED' } : {}) });
  const resource = useResource(() => api.submissions(filters), [filters]);
  const items = resource.data?.items ?? [];
  const catalogsData = catalogs.data as Catalogs | undefined;
  const title = reviewMode ? 'مراقبة المراجعات' : 'سجل الحالات والكاسشيتات';
  const description = reviewMode ? 'متابعة إدارية للحالات المرسلة دون عرض أفعال اعتماد أو تقييم.' : 'سجل إداري للحالات والكاسشيتات ضمن النطاق الذي يعيده الخادم.';

  return <>
    <PageHeader eyebrow="CLINICAL OPERATIONS · CONTROL" title={title} description={description} actions={<span className="read-only-label">قراءة فقط</span>} />
    {catalogs.loading ? <CatalogWarning loading /> : catalogs.error ? <CatalogWarning /> : <ClinicalOperationsFilters filters={filters} setFilters={setFilters} departments={catalogsData?.[0] ?? []} academicYears={catalogsData?.[1] ?? []} academicLevels={catalogsData?.[2] ?? []} cohorts={catalogsData?.[3] ?? []} />}
    {resource.loading ? <LoadingState label="جارٍ تحميل سجل الحالات…" /> : resource.error ? <ErrorState error={resource.error} onRetry={() => resource.reload()} /> : !items.length ? <EmptyState title={reviewMode ? 'لا توجد مراجعات مطابقة' : 'لا توجد حالات مطابقة'} description="لم يعُد الخادم حالات ضمن النطاق والفلاتر الحالية." /> : <section className="surface"><div className="surface-heading"><div><span className="eyebrow">{reviewMode ? 'REVIEW MONITORING' : 'CASE REGISTRY'}</span><h2>{reviewMode ? 'الحالات المرسلة للمتابعة' : 'الحالات والكاسشيتات'}</h2></div><span className="directory-count">{resource.data?.page.total ?? items.length} نتيجة</span></div><SubmissionRegistryTable items={items} catalogs={catalogsData} reviewMode={reviewMode} /><Pager {...resource.data!.page} onPage={(page) => setFilters({ ...filters, page })} /></section>}
  </>;
}

function DetailSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="surface"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{children}</section>;
}

export function ClinicalCaseRegistryControlPage() {
  return <ClinicalCaseListPage />;
}

export function ClinicalReviewMonitoringControlPage() {
  return <ClinicalCaseListPage reviewMode />;
}

export function ClinicalCaseDetailControlPage({ id }: { id: string }) {
  const resource = useResource<SubmissionDetailDto>(() => api.submission(id), [id]);
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const detail = resource.data;
  const catalogsData = catalogs.data as Catalogs | undefined;

  if (resource.loading) return <LoadingState label="جارٍ تحميل تفاصيل الحالة…" />;
  if (resource.error) return <ErrorState error={resource.error} onRetry={() => resource.reload()} />;
  if (!detail) return <EmptyState title="لا توجد بيانات للحالة" description="لم يعُد الخادم تفاصيل هذه الحالة ضمن النطاق الحالي." />;

  const context = academicContext(detail, catalogsData);
  const timeline = [
    ...detail.decisions.map((item) => ({ id: item.id, at: item.createdAt, title: item.type, detail: item.reason })),
    ...detail.revisions.map((item) => ({ id: item.id, at: item.createdAt, title: 'REVISION_REQUEST', detail: item.reason })),
    ...detail.grades.map((item) => ({ id: item.id, at: item.createdAt, title: `${item.action} · ${item.newGrade}/${item.maxGrade}`, detail: item.comment })),
    ...detail.supervisorNotes.map((item) => ({ id: item.id, at: item.createdAt, title: 'SUPERVISOR_NOTE', detail: item.body })),
  ].sort((left, right) => left.at.localeCompare(right.at));

  return <>
    <button type="button" className="back-link" onClick={() => navigate('/control/clinical-operations/cases')}>← العودة إلى سجل الحالات</button>
    <PageHeader eyebrow="CLINICAL CASE · CONTROL" title={detail.caseSheetId} description={`${detail.studentDisplayName} · ${detail.studentNumber}`} actions={<span className="read-only-label">قراءة فقط</span>} />
    {catalogs.error ? <CatalogWarning /> : null}
    <section className="profile-summary surface"><div><span>الطالب</span><strong>{detail.studentDisplayName}</strong><small className="block mono">{detail.studentId}</small></div><div><span>الرقم الجامعي</span><strong className="mono">{detail.studentNumber}</strong></div><div><span>القسم</span><strong>{catalogLabel(catalogsData?.[0], detail.departmentId)}</strong></div><div><span>السياق الأكاديمي</span><strong>{context.year}</strong><small className="block">{context.level} · {context.cohort}</small></div><div><span>الحالة</span><StatusBadge value={detail.status} /></div><div><span>تاريخ الإرسال</span><strong>{formatDate(detail.submittedAt)}</strong></div><div><span>التسلسل</span><strong>{detail.sequence}</strong></div><div><span>المشرف المرتبط</span><strong className="mono">{detail.supervisorAssignmentId ?? '—'}</strong></div></section>
    <DetailSection eyebrow="IMMUTABLE SNAPSHOT" title="بيانات الكاسشيت"><div className="payload-grid">{Object.entries(detail.payload).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd></div>)}</div></DetailSection>
    <DetailSection eyebrow="WORKFLOW HISTORY" title="سجل الحالة"><p className="section-intro">عرض زمني للقرارات وطلبات المراجعة والتقييمات والملاحظات التي أعادها العقد الحالي.</p>{timeline.length ? <div className="timeline">{timeline.map((item) => <article key={item.id}><span className="timeline-dot" /><div><header><b>{item.title}</b><small>{formatDate(item.at)}</small></header>{item.detail ? <p>{item.detail}</p> : null}</div></article>)}</div> : <EmptyState title="لا يوجد تاريخ قرار أو تقييم" description="لم يسجل الخادم أحداثًا لهذه الحالة." />}</DetailSection>
    <DetailSection eyebrow="ATTACHMENTS" title="المرفقات"><div className="attachment-list">{detail.attachments.length ? detail.attachments.map((attachment) => <article key={attachment.id}><div><b>{attachment.contentType}</b><small>{Math.ceil(attachment.byteSize / 1024)} KB · SHA-256 {attachment.sha256.slice(0, 12)}… · {formatDate(attachment.createdAt)}</small></div></article>) : <EmptyState title="لا توجد مرفقات" description="لا توجد ملفات مرتبطة بهذه الحالة." />}</div></DetailSection>
    <section className="state-card empty-state"><h2>عرض إداري فقط</h2><p>لا تعرض هذه المساحة أزرار اعتماد أو تعديل تقييم أو تغيير حالة أو إعادة فتح أو حذف. أي إجراءات تشغيلية تخص المشرف تبقى داخل Supervisor Workspace ويقررها Backend Authorization.</p></section>
  </>;
}
