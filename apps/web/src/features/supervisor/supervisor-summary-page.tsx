import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

export function SupervisorSummaryPage() {
  const [academicYearId, setAcademicYearId] = useState('');
  const yearsRes = useResource(() => api.academicYears(), []);
  const capabilitiesRes = useResource(() => api.supervisorCapabilities(), []);
  const summaryRes = useResource(() => academicYearId ? api.supervisorWorkSummary(academicYearId) : Promise.resolve(undefined), [academicYearId]);

  useEffect(() => {
    if (academicYearId || !yearsRes.data?.length) return;
    const activeYear = yearsRes.data.find((year) => year.status === 'ACTIVE') ?? yearsRes.data[0];
    setAcademicYearId(activeYear.id);
  }, [academicYearId, yearsRes.data]);

  if (yearsRes.loading || capabilitiesRes.loading || (academicYearId && summaryRes.loading)) {
    return <LoadingState label="جارٍ تحميل ملخص أعمال المشرف من الخادم…" />;
  }
  if (yearsRes.error) return <ErrorState error={yearsRes.error} onRetry={() => yearsRes.reload()} />;
  if (capabilitiesRes.error) return <ErrorState error={capabilitiesRes.error} onRetry={() => capabilitiesRes.reload()} />;
  if (summaryRes.error) return <ErrorState error={summaryRes.error} onRetry={() => summaryRes.reload()} />;

  if (!capabilitiesRes.data?.capabilities.includes('WORK_SUMMARY_READ')) {
    return <>
      <PageHeader eyebrow="CLINICAL SUPERVISOR" title="ملخص أعمال المشرف" description="قراءة تحليلية لنشاط المشرف ضمن النطاق الأكاديمي المتاح." />
      <EmptyState title="لا توجد صلاحية لعرض الملخص" description="لم يمنح الخادم حسابك capability قراءة ملخص أعمال المشرف." />
    </>;
  }

  if (!yearsRes.data?.length) {
    return <>
      <PageHeader eyebrow="SUPERVISOR SUMMARY" title="ملخص أعمال المشرف" description="قراءة تحليلية لنشاط المشرف خلال الفترة الأكاديمية." />
      <EmptyState title="لا توجد سنة أكاديمية متاحة" description="لا يمكن تحميل ملخص الأعمال قبل اختيار سنة أكاديمية من البيانات المرجعية." />
    </>;
  }

  const summary = summaryRes.data;
  const selectedYear = yearsRes.data.find((year) => year.id === academicYearId);
  if (!summary) return <EmptyState title="لا تتوفر بيانات ملخص" description="لم يُعد الخادم ملخصًا للسنة الأكاديمية المختارة." />;

  return <>
    <PageHeader
      eyebrow="SUPERVISOR WORK SUMMARY"
      title="ملخص أعمال المشرف"
      description="ملخص للقراءة والتحليل فقط، منفصل عن كشف اليوم وطابور المراجعة والسجل التاريخي."
      actions={<label className="date-picker-field summary-filter-field"><span>السنة الأكاديمية</span><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)} aria-label="اختيار السنة الأكاديمية"><option value="" disabled>اختر السنة</option>{yearsRes.data.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></label>}
    />

    <section className="summary-scope-banner" aria-label="نطاق الملخص">
      <strong>{selectedYear?.label ?? 'السنة المحددة'}</strong>
      <span>{summary.term_id ? `Term ID: ${summary.term_id}` : 'ملخص على مستوى السنة الأكاديمية'}</span>
      <small>آخر تحديث: {formatGeneratedAt(summary.generated_at)}</small>
    </section>

    <section className="surface">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">OPERATIONAL ACTIVITY</span>
          <h2>مؤشرات نشاط الإشراف</h2>
        </div>
        <span className="read-only-label">قراءة فقط</span>
      </div>
      <div className="metric-grid summary-metric-grid">
        <article className="metric-card metric-blue"><span>أيام الإشراف</span><strong>{summary.supervision_days}</strong><small>أيام مرتبطة بسجلات المناوبات</small></article>
        <article className="metric-card metric-teal"><span>اعتمادات البدء</span><strong>{summary.start_approvals}</strong><small>قرارات بدء مسجلة</small></article>
        <article className="metric-card metric-gold"><span>اعتمادات الإنهاء</span><strong>{summary.completion_approvals}</strong><small>قرارات إنهاء مسجلة</small></article>
        <article className="metric-card metric-violet"><span>التقييمات المكتملة</span><strong>{summary.evaluations}</strong><small>تقييمات مسجلة من المشرف</small></article>
        <article className="metric-card metric-teal"><span>الملاحظات</span><strong>{summary.feedback_notes}</strong><small>ملاحظات سريرية مسجلة</small></article>
        <article className={`metric-card ${summary.deferred_work ? 'metric-gold' : 'metric-teal'}`}><span>أعمال مؤجلة</span><strong>{summary.deferred_work}</strong><small>{summary.deferred_work ? 'تحتاج متابعة في مساحة المراجعة' : 'لا توجد أعمال مؤجلة في النطاق'}</small></article>
      </div>
    </section>

    <section className="surface summary-analysis-grid">
      <article>
        <span className="eyebrow">WORKLOAD SIGNAL</span>
        <h2>{summary.deferred_work ? 'هناك أعمال تحتاج متابعة' : 'لا توجد أعمال مؤجلة مثبتة'}</h2>
        <p>{summary.deferred_work ? 'هذا الرقم يصف الأعمال التي ما زالت معلقة في read model الحالي. تفاصيل كل عنصر تبقى في Review Queue.' : 'لا يعرض العقد الحالي عناصر معلقة ضمن نطاق الملخص المحدد.'}</p>
      </article>
      <article className="summary-limitations">
        <span className="eyebrow">CONTRACT COVERAGE</span>
        <h2>بيانات غير متاحة في العقد الحالي</h2>
        <p>لا يخترع النظام أرقامًا للطلاب الذين تمت متابعتهم أو عدد الحالات التي تم التعامل معها أو عدد الكاسشيتات التي تمت مراجعتها؛ هذه الحقول غير موجودة في `SupervisorWorkSummaryDto` الحالي.</p>
        <small>تحتاج هذه المؤشرات إلى Backend Contract لاحق يحدد الفترة ومصدر العد بوضوح.</small>
      </article>
    </section>
  </>;
}
