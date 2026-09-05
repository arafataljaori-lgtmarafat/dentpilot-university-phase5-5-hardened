import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, Field, LoadingState, MetricCard, PageHeader } from '../../components/ui';

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

export function DashboardPage() {
  const catalogs = useResource(() => Promise.all([api.academicYears(), api.departments()]), []);
  const [academicYearId, setAcademicYearId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  useEffect(() => {
    if (!academicYearId && catalogs.data?.[0].length) {
      setAcademicYearId(catalogs.data[0].find((year) => year.status === 'ACTIVE')?.id ?? catalogs.data[0][0].id);
    }
  }, [academicYearId, catalogs.data]);

  const report = useResource(
    () => academicYearId
      ? Promise.all([api.dashboard(academicYearId, departmentId || undefined), api.scopedReport(academicYearId, departmentId || undefined)])
      : Promise.resolve(undefined),
    [academicYearId, departmentId],
  );

  const selectedYear = catalogs.data?.[0].find((year) => year.id === academicYearId);
  const selectedDepartment = catalogs.data?.[1].find((department) => department.id === departmentId);
  const scopeLabel = selectedDepartment?.name ?? 'كل الأقسام المخولة';
  const overview = report.data?.[0];
  const scopedReport = report.data?.[1];

  return <>
    <PageHeader
      eyebrow="CONTROL DESKTOP"
      title="لوحة تحكم كلية طب الأسنان"
      description="نظرة إدارية مختصرة على الطلاب، المشرفين، المناوبات، والعمليات السريرية ضمن النطاق المسموح للخادم."
      actions={<div className="filter-row compact dashboard-filters">
        <Field label="السنة الأكاديمية"><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="">اختر السنة</option>{catalogs.data?.[0].map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></Field>
        <Field label="النطاق"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">كل الأقسام المخولة</option>{catalogs.data?.[1].map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
      </div>}
    />

    {catalogs.loading || report.loading ? <LoadingState label="جارٍ تحميل مؤشرات لوحة التحكم من الخادم…" /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : !catalogs.data?.[0].length || !overview || !scopedReport ? <EmptyState title="لا توجد بيانات لوحة تحكم" description="لم يعُد الخادم بيانات أكاديمية أو تشغيلية متاحة للنطاق والفلاتر الحالية." /> : <>
      <section className="control-scope-banner" aria-label="نطاق لوحة التحكم">
        <div><span className="eyebrow">CURRENT CONTROL SCOPE</span><strong>كلية طب الأسنان · جامعة الجزيرة</strong></div>
        <div><span>السنة</span><b>{selectedYear?.label ?? 'غير محددة'}</b></div>
        <div><span>النطاق</span><b>{scopeLabel}</b></div>
        <small>المؤشرات للقراءة والمتابعة فقط، وكل الصلاحيات يحددها الخادم.</small>
      </section>

      <section className="control-dashboard-section" aria-labelledby="control-priority-heading">
        <div className="surface-heading"><div><span className="eyebrow">PRIORITY SIGNALS</span><h2 id="control-priority-heading">ما يحتاج انتباه الإدارة</h2></div><span className="dashboard-updated">تم التوليد: {formatGeneratedAt(scopedReport.generatedAt)}</span></div>
        <div className="metric-grid control-priority-grid">
          <MetricCard label="حالات أو مراجعات معلقة" value={overview.pendingClinicalDecisions} hint={overview.pendingClinicalDecisions ? 'تحتاج قرارًا سريريًا' : 'لا توجد قرارات معلقة'} tone="gold" />
          <MetricCard label="الطلاب والتسجيلات" value={overview.totalStudents} hint="طلاب ضمن النطاق المحدد" />
          <MetricCard label="المشرفون الفعالون" value={overview.activeSupervisors} hint="مشرفون بتكليفات سارية" tone="blue" />
          <MetricCard label="التسليمات السريرية" value={overview.totalSubmittedCases} hint="حالات مرسلة إلى النظام" tone="violet" />
          <MetricCard label="الحالات المقيمة" value={overview.gradedCases} hint="حالات لها سجل تقييم" tone="teal" />
        </div>
      </section>

      <section className="control-dashboard-grid">
        <article className="surface control-activity-card">
          <div className="surface-heading"><div><span className="eyebrow">ACADEMIC ACTIVITY</span><h2>النشاط الأكاديمي</h2></div><span className="dashboard-card-link">البنية الأكاديمية</span></div>
          <div className="activity-summary"><strong>{scopedReport.rows.length}</strong><span>أقسام ضمن النطاق</span></div>
          <p>متابعة مقارنة الأقسام والطلاب والحالات المرسلة ضمن السنة الأكاديمية المختارة.</p>
          <div className="inline-stat-list"><span><b>{overview.totalStudents}</b> طالب</span><span><b>{overview.totalSubmittedCases}</b> حالة مرسلة</span></div>
        </article>
        <article className="surface control-activity-card">
          <div className="surface-heading"><div><span className="eyebrow">SCHEDULE COVERAGE</span><h2>المشرفون والمناوبات</h2></div><span className="dashboard-card-link">تغطية التشغيل</span></div>
          <div className="activity-summary"><strong>{overview.activeSupervisors}</strong><span>مشرف فعال</span></div>
          <p>المؤشر المتاح حاليًا يعكس المشرفين ذوي التكليفات السارية، بينما تفاصيل المناوبات تظل في قسم الجداول.</p>
          <div className="inline-stat-list"><span><b>{overview.activeSupervisors}</b> تكليفات فعالة</span><span><b>{overview.pendingClinicalDecisions}</b> قرار معلق</span></div>
        </article>
      </section>

      <section className="surface control-department-section">
        <div className="surface-heading"><div><span className="eyebrow">DEPARTMENT OVERVIEW</span><h2>مقارنة الأقسام</h2></div><small>بيانات للقراءة فقط</small></div>
        {scopedReport.rows.length ? <div className="department-grid">{scopedReport.rows.map((row) => <article className="department-card" key={row.departmentId}><header><span>{row.departmentCode}</span><h3>{row.departmentName}</h3></header><dl><div><dt>الطلاب</dt><dd>{row.studentCount}</dd></div><div><dt>الحالات</dt><dd>{row.submittedCases}</dd></div><div><dt>المعلّق</dt><dd>{row.pendingClinicalDecisions}</dd></div><div><dt>متوسط التقييم</dt><dd>{row.averageGrade ?? '—'}</dd></div></dl></article>)}</div> : <EmptyState title="لا توجد بيانات أقسام" description="لا توجد مؤشرات مقارنة ضمن النطاق المحدد." />}
      </section>
    </>}
  </>;
}
