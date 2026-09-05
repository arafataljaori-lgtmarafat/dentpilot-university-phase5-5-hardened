import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';
import type { SupervisorCapability, SupervisorNextAction, SupervisorReviewQueueItemDto } from '@dentpilot/contracts';

const ACTION_LABELS: Record<SupervisorNextAction, string> = {
  START_APPROVAL: 'بدء مطلوب',
  COMPLETION_APPROVAL: 'إنهاء مطلوب',
  EVALUATION: 'تقييم مطلوب',
  FEEDBACK: 'مراجعة مطلوبة',
  NONE: 'مكتمل',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الإجراء',
  SUBMITTED: 'مرسل',
  APPROVED_START: 'بدأ',
  APPROVED_FINAL: 'منتهٍ',
  GRADED: 'مقيّم',
  REVISION_REQUESTED: 'يحتاج مراجعة',
  DRAFT: 'مسودة',
};

const ACTION_PRIORITY: Record<SupervisorNextAction, number> = {
  START_APPROVAL: 0,
  COMPLETION_APPROVAL: 1,
  EVALUATION: 2,
  FEEDBACK: 3,
  NONE: 4,
};

function actionLabel(action: SupervisorNextAction): string {
  return ACTION_LABELS[action];
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

function statusClass(status: string): string {
  return status.toLowerCase().replaceAll('_', '-');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'Asia/Riyadh' }).format(new Date(`${value}T12:00:00`));
}

function isActionAllowed(item: SupervisorReviewQueueItemDto): boolean {
  const actionMap: Partial<Record<SupervisorNextAction, SupervisorReviewQueueItemDto['allowedActions'][number]>> = {
    START_APPROVAL: 'START_APPROVAL',
    COMPLETION_APPROVAL: 'COMPLETION_APPROVAL',
    EVALUATION: 'CASESHEET_EVALUATION',
    FEEDBACK: 'CLINICAL_FEEDBACK',
  };
  const requiredPermission = actionMap[item.action_required];
  return item.is_action_allowed_now && Boolean(requiredPermission && item.allowedActions.includes(requiredPermission));
}

function ReviewQueueTable({ items }: { items: SupervisorReviewQueueItemDto[] }) {
  const orderedItems = [...items].sort((left, right) => {
    const leftAllowed = isActionAllowed(left) ? 0 : 1;
    const rightAllowed = isActionAllowed(right) ? 0 : 1;
    return leftAllowed - rightAllowed
      || ACTION_PRIORITY[left.action_required] - ACTION_PRIORITY[right.action_required]
      || left.original_duty_date.localeCompare(right.original_duty_date)
      || left.student_display_name.localeCompare(right.student_display_name, 'ar');
  });

  return <div className="table-wrap">
    <table className="data-table supervisor-review-queue">
      <thead>
        <tr>
          <th>الطالب</th>
          <th>الرقم الجامعي</th>
          <th>المادة / القسم</th>
          <th>الإجراء المطلوب</th>
          <th>الحالة الحالية</th>
          <th>المناوبة الأصلية</th>
          <th>الإجراء التالي</th>
          <th>فتح</th>
        </tr>
      </thead>
      <tbody>
        {orderedItems.map((item) => {
          const allowedNow = isActionAllowed(item);
          return <tr key={`${item.snapshot_id}-${item.action_required}`}>
            <td data-label="الطالب"><strong>{item.student_display_name}</strong></td>
            <td data-label="الرقم الجامعي">{item.student_number}</td>
            <td data-label="المادة / القسم">
              <strong>{item.subject_name ?? 'غير محدد'}</strong>
              <small className="table-subtext">{item.department_name}</small>
            </td>
            <td data-label="الإجراء المطلوب"><span className={`next-action-badge action-${item.action_required.toLowerCase().replaceAll('_', '-')}`}>{actionLabel(item.action_required)}</span></td>
            <td data-label="الحالة الحالية"><span className={`status-badge status-${statusClass(item.case_status)}`}>{statusLabel(item.case_status)}</span></td>
            <td data-label="المناوبة الأصلية">{formatDate(item.original_duty_date)}</td>
            <td data-label="الإجراء التالي">
              {allowedNow ? <span className="queue-availability is-available">متاح الآن</span> : <span className="queue-availability is-deferred">مؤجل أو غير متاح حاليًا</span>}
            </td>
            <td data-label="فتح"><button type="button" className="button ghost" onClick={() => navigate(`/supervisor/cases/${item.snapshot_id}`)}>{allowedNow ? 'فتح للتنفيذ' : 'فتح للمراجعة'}</button></td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export function SupervisorQueuePage() {
  const queueRes = useResource(() => api.supervisorReviewQueue(), []);
  const capabilitiesRes = useResource(() => api.supervisorCapabilities(), []);
  const loading = queueRes.loading || capabilitiesRes.loading;

  if (loading) return <LoadingState label="جارٍ تحميل أعمال المراجعة من الخادم…" />;
  if (queueRes.error) return <ErrorState error={queueRes.error} onRetry={() => queueRes.reload()} />;
  if (capabilitiesRes.error) return <ErrorState error={capabilitiesRes.error} onRetry={() => capabilitiesRes.reload()} />;

  const capabilities = capabilitiesRes.data?.capabilities ?? [];
  const canReadQueue = capabilities.includes('REVIEW_QUEUE_READ' as SupervisorCapability);
  if (!canReadQueue) {
    return <>
      <PageHeader eyebrow="CLINICAL SUPERVISOR" title="مراجعة الأعمال" description="مساحة الأعمال التي تحتاج متابعة من المشرف السريري." />
      <EmptyState title="لا توجد صلاحية لعرض قائمة المراجعة" description="لم يمنح الخادم حسابك capability قراءة قائمة المراجعة الحالية." />
    </>;
  }

  const items = queueRes.data?.items ?? [];
  return <>
    <PageHeader
      eyebrow="SUPERVISOR REVIEW QUEUE"
      title="مراجعة الأعمال"
      description="الأعمال التي تحتاج قرارًا أو مراجعة من المشرف، مرتبة حسب الإجراء المتاح الآن ثم الأعمال المؤجلة."
    />
    <section className="queue-priority-note" aria-label="ترتيب الأولوية">
      <strong>الأولوية التشغيلية</strong>
      <span>متاح الآن</span>
      <span>ثم الأعمال المؤجلة أو غير المتاحة حاليًا</span>
    </section>
    <section className="surface">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">ACTION REQUIRED</span>
          <h2>العناصر التي تحتاج تدخلًا</h2>
        </div>
        <span className="sheet-count">{items.length} عنصر</span>
      </div>
      {items.length ? <ReviewQueueTable items={items} /> : <EmptyState title="لا توجد أعمال تحتاج مراجعة" description="لا توجد حاليًا عناصر بانتظار إجراء ضمن الصلاحيات أو المناوبات المعروفة للخادم." />}
    </section>
  </>;
}
