import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, MetricCard, PageHeader } from '../../components/ui';

export function ReportsPage() {
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
      ? Promise.all([
        api.dashboard(academicYearId, departmentId || undefined),
        api.scopedReport(academicYearId, departmentId || undefined),
      ])
      : Promise.resolve(undefined),
    [academicYearId, departmentId],
  );

  const totals = useMemo(() => report.data?.[1].rows.reduce((current, row) => ({
    students: current.students + row.studentCount,
    submitted: current.submitted + row.submittedCases,
    pending: current.pending + row.pendingClinicalDecisions,
    graded: current.graded + row.gradedCases,
  }), { students: 0, submitted: 0, pending: 0, graded: 0 }), [report.data]);

  return <>
    <PageHeader eyebrow="SCOPED REPORTING" title="التقارير" description="نماذج قراءة مجمعة يولدها الخادم ضمن نطاق المؤسسة والقسم المصرح بهما." actions={<div className="filter-row compact">
      <Field label="السنة الأكاديمية"><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="">اختر السنة</option>{catalogs.data?.[0].map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></Field>
      <Field label="القسم"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">كل الأقسام المخولة</option>{catalogs.data?.[1].map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
    </div>} />
    {catalogs.loading || report.loading ? <LoadingState label="جارٍ إنشاء التقرير من الخادم…" /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : report.error ? <ErrorState error={report.error} onRetry={report.reload} /> : !report.data ? <EmptyState title="لا توجد سنة أكاديمية" description="لا توجد سنة متاحة لإنشاء التقرير." /> : <>
      <section className="metric-grid">
        <MetricCard label="الطلاب" value={totals?.students ?? report.data[0].totalStudents} hint="إجمالي النطاق" />
        <MetricCard label="الحالات المرسلة" value={totals?.submitted ?? report.data[0].totalSubmittedCases} hint="حالات سريرية" tone="blue" />
        <MetricCard label="القرارات المعلقة" value={totals?.pending ?? report.data[0].pendingClinicalDecisions} hint="تنتظر المراجعة" tone="gold" />
        <MetricCard label="الحالات المقيمة" value={totals?.graded ?? report.data[0].gradedCases} hint="لها درجة" tone="violet" />
      </section>
      <section className="surface">
        <div className="surface-heading"><div><span className="eyebrow">DEPARTMENT READ MODEL</span><h2>تفصيل الأداء حسب القسم</h2></div><small>تم التوليد: {new Date(report.data[1].generatedAt).toLocaleString('ar')}</small></div>
        {report.data[1].rows.length ? <DataTable><thead><tr><th>القسم</th><th>الطلاب</th><th>الحالات</th><th>المعلّق</th><th>المقيّم</th><th>متوسط الدرجة</th></tr></thead><tbody>{report.data[1].rows.map((row) => <tr key={row.departmentId}><td><b>{row.departmentName}</b><small className="block">{row.departmentCode}</small></td><td>{row.studentCount}</td><td>{row.submittedCases}</td><td>{row.pendingClinicalDecisions}</td><td>{row.gradedCases}</td><td>{row.averageGrade ?? '—'}</td></tr>)}</tbody></DataTable> : <EmptyState title="لا توجد نتائج" description="لا توجد مؤشرات ضمن السنة والنطاق الحاليين." />}
      </section>
    </>}
  </>;
}
