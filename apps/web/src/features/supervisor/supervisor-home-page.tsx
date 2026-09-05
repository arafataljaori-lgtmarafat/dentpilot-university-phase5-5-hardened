import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';
import type { SupervisorDailySheetDto, SupervisorReviewQueueDto, SupervisorWorkSummaryDto } from '@dentpilot/contracts';

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeZone: 'Asia/Riyadh' }).format(new Date());
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ar', { timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    START_APPROVAL: 'بدء',
    COMPLETION_APPROVAL: 'إنهاء',
    EVALUATION: 'تقييم',
    FEEDBACK: 'مراجعة',
  };
  return labels[action] ?? action;
}

function actionCounts(queue: SupervisorReviewQueueDto | undefined, allowed: boolean): string {
  const items = (queue?.items ?? []).filter((item) => item.is_action_allowed_now === allowed);
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item.action_required, (counts.get(item.action_required) ?? 0) + 1));
  return [...counts.entries()].map(([action, count]) => `${count} ${actionLabel(action)}`).join(' · ') || 'لا توجد عناصر';
}

function statusCounts(sheet: SupervisorDailySheetDto | undefined): string {
  const items = sheet?.items ?? [];
  const active = items.filter((item) => item.next_action !== 'NONE').length;
  const completed = items.length - active;
  return `${active} تحتاج متابعة · ${completed} مكتملة`;
}

function HomeCard({
  eyebrow,
  title,
  value,
  detail,
  tone,
  onClick,
  disabled = false,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  tone: 'duty' | 'urgent' | 'sheet' | 'deferred' | 'summary';
  onClick: () => void;
  disabled?: boolean;
}) {
  return <button type="button" className={`supervisor-home-card supervisor-home-card-${tone}`} onClick={onClick} disabled={disabled}>
    <span className="supervisor-home-card-eyebrow">{eyebrow}</span>
    <span className="supervisor-home-card-title">{title}</span>
    <strong className="supervisor-home-card-value">{value}</strong>
    <span className="supervisor-home-card-detail">{detail}</span>
    <span className="supervisor-home-card-link">فتح المساحة <span aria-hidden="true">←</span></span>
  </button>;
}

function CardError({ label }: { label: string }) {
  return <div className="supervisor-home-card supervisor-home-card-error" role="status">
    <span className="supervisor-home-card-eyebrow">تعذر التحميل</span>
    <strong>{label}</strong>
    <span className="supervisor-home-card-detail">يمكن إعادة المحاولة من الصفحة المتخصصة.</span>
  </div>;
}

export function SupervisorHomePage() {
  const [academicYearId, setAcademicYearId] = useState('');
  const capabilitiesRes = useResource(() => api.supervisorCapabilities(), []);
  const dailyRes = useResource(() => api.supervisorDailySheet(), []);
  const queueRes = useResource(() => api.supervisorReviewQueue(), []);
  const yearsRes = useResource(() => api.academicYears(), []);
  const summaryRes = useResource<SupervisorWorkSummaryDto | undefined>(() => academicYearId ? api.supervisorWorkSummary(academicYearId) : Promise.resolve(undefined), [academicYearId]);

  useEffect(() => {
    if (academicYearId || !yearsRes.data?.length) return;
    const activeYear = yearsRes.data.find((year) => year.status === 'ACTIVE') ?? yearsRes.data[0];
    setAcademicYearId(activeYear.id);
  }, [academicYearId, yearsRes.data]);

  const isLoading = capabilitiesRes.loading || dailyRes.loading || queueRes.loading || yearsRes.loading;
  if (isLoading) return <LoadingState label="جارٍ تجهيز مساحة المشرف…" />;

  if (capabilitiesRes.error) return <ErrorState error={capabilitiesRes.error} onRetry={() => capabilitiesRes.reload()} />;

  const capabilities = capabilitiesRes.data?.capabilities ?? [];
  const daily = dailyRes.data;
  const queue = queueRes.data;
  const summary = summaryRes.data;
  const duty = daily?.duty;
  const todayLabel = todayInRiyadh();
  const actionableCount = queue?.items.filter((item) => item.is_action_allowed_now).length ?? 0;
  const deferredCount = queue?.items.filter((item) => !item.is_action_allowed_now).length ?? 0;
  const dailyCount = daily?.items.length ?? 0;
  const activeYear = yearsRes.data?.find((year) => year.id === academicYearId);

  return <>
    <PageHeader eyebrow="CLINICAL SUPERVISOR" title="مساحة المشرف" description="لوحة قرار سريرية سريعة للعمل أثناء المناوبة، مع بقاء الصلاحيات والإجراءات تحت سيطرة الخادم." />
    <p className="supervisor-home-date">{todayLabel}</p>

    <main className="supervisor-home-grid" aria-label="لوحة قرار المشرف">
      {dailyRes.error ? <CardError label="لا يمكن تحميل حالة المناوبة الحالية" /> : <HomeCard
        eyebrow="CURRENT DUTY"
        title={duty ? 'المناوبة الحالية' : 'لا توجد مناوبة اليوم'}
        value={duty ? `${formatTime(duty.starts_at)} — ${formatTime(duty.ends_at)}` : 'خارج المناوبة'}
        detail={duty ? 'كشف اليوم جاهز للمتابعة' : 'يمكنك مراجعة المساحات الأخرى عند الحاجة'}
        tone="duty"
        onClick={() => navigate('/supervisor/daily-sheet')}
      />}

      {queueRes.error ? <CardError label="تعذر تحميل الأعمال التي تحتاج قرارًا" /> : <HomeCard
        eyebrow="ACTION REQUIRED NOW"
        title="يحتاج قرارًا الآن"
        value={String(actionableCount)}
        detail={actionCounts(queue, true)}
        tone="urgent"
        onClick={() => navigate('/supervisor/queue')}
        disabled={!capabilities.includes('REVIEW_QUEUE_READ')}
      />}

      {dailyRes.error ? <CardError label="تعذر تحميل كشف اليوم" /> : <HomeCard
        eyebrow="TODAY'S SHEET"
        title="كشف اليوم"
        value={`${dailyCount} حالة`}
        detail={statusCounts(daily)}
        tone="sheet"
        onClick={() => navigate('/supervisor/daily-sheet')}
        disabled={!capabilities.includes('DAILY_SHEET_READ')}
      />}

      {queueRes.error ? <CardError label="تعذر تحميل الأعمال المؤجلة" /> : <HomeCard
        eyebrow="DEFERRED WORK"
        title="أعمال مؤجلة"
        value={String(deferredCount)}
        detail={actionCounts(queue, false)}
        tone="deferred"
        onClick={() => navigate('/supervisor/queue')}
        disabled={!capabilities.includes('REVIEW_QUEUE_READ')}
      />}

      {summaryRes.error ? <CardError label="تعذر تحميل ملخص النشاط" /> : <HomeCard
        eyebrow="WORK SUMMARY"
        title="ملخص النشاط"
        value={summary ? `${summary.evaluations} تقييمات` : 'غير متاح'}
        detail={summary ? `${summary.supervision_days} أيام إشراف · ${summary.deferred_work} مؤجل · ${activeYear?.label ?? 'السنة الحالية'}` : 'ملخص السنة الأكاديمية قيد التحميل'}
        tone="summary"
        onClick={() => navigate('/supervisor/summary')}
        disabled={!capabilities.includes('WORK_SUMMARY_READ') || !summary}
      />}
    </main>
  </>;
}
