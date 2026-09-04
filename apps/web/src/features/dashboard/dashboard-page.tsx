import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, Field, LoadingState, MetricCard, PageHeader } from '../../components/ui';

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

  return <>
    <PageHeader eyebrow="EXECUTIVE OVERVIEW" title="لوحة المتابعة" description="مؤشرات مجمعة من الخادم ضمن السنة والقسم المخولين فقط." actions={<div className="filter-row compact">
      <Field label="السنة الأكاديمية"><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="">اختر السنة</option>{catalogs.data?.[0].map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></Field>
      <Field label="القسم"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">كل الأقسام المخولة</option>{catalogs.data?.[1].map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
    </div>} />
    {catalogs.loading || report.loading ? <LoadingState /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : !report.data ? <EmptyState title="لا توجد سنة أكاديمية" description="لم يعُد الخادم أي سنة أكاديمية متاحة لهذا الحساب." /> : <>
      <section className="metric-grid">
        <MetricCard label="الطلاب" value={report.data[0].totalStudents} hint="ضمن النطاق المختار" />
        <MetricCard label="التسليمات" value={report.data[0].totalSubmittedCases} hint="حالات مرسلة" tone="blue" />
        <MetricCard label="مراجعات معلقة" value={report.data[0].pendingClinicalDecisions} hint="تحتاج قرارًا سريريًا" tone="gold" />
        <MetricCard label="حالات مقيمة" value={report.data[0].gradedCases} hint="لها سجل تقييم" tone="violet" />
        <MetricCard label="مشرفون فعالون" value={report.data[0].activeSupervisors} hint="تكليفات سارية" />
      </section>
      <section className="surface">
        <div className="surface-heading"><div><span className="eyebrow">DEPARTMENT PERFORMANCE</span><h2>مقارنة الأقسام</h2></div><small>تم التوليد: {new Date(report.data[1].generatedAt).toLocaleString('ar')}</small></div>
        {report.data[1].rows.length ? <div className="department-grid">{report.data[1].rows.map((row) => <article className="department-card" key={row.departmentId}><header><span>{row.departmentCode}</span><h3>{row.departmentName}</h3></header><dl><div><dt>الطلاب</dt><dd>{row.studentCount}</dd></div><div><dt>الحالات</dt><dd>{row.submittedCases}</dd></div><div><dt>المعلّق</dt><dd>{row.pendingClinicalDecisions}</dd></div><div><dt>المتوسط</dt><dd>{row.averageGrade ?? '—'}</dd></div></dl></article>)}</div> : <EmptyState title="لا توجد بيانات تقرير" description="لا توجد مؤشرات ضمن الفلاتر الحالية." />}
      </section>
    </>}
  </>;
}
