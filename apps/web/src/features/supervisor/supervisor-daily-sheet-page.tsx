import { useState } from 'react';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';
import type { SupervisorDailySheetItemDto, SupervisorNextAction } from '@dentpilot/contracts';
import { api } from '../../api/client';

const ACTION_LABELS: Record<SupervisorNextAction | 'REVIEW' | 'HISTORICAL', string> = {
  START_APPROVAL: 'بدء مطلوب',
  COMPLETION_APPROVAL: 'إنهاء مطلوب',
  EVALUATION: 'تقييم مطلوب',
  FEEDBACK: 'مراجعة مطلوبة',
  NONE: 'مكتمل',
  REVIEW: 'تحتاج مراجعة',
  HISTORICAL: 'سجل تاريخي',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الإجراء',
  APPROVED: 'معتمد',
  SUBMITTED: 'مرسل',
  APPROVED_START: 'بدأ',
  APPROVED_FINAL: 'منتهٍ',
  GRADED: 'مقيّم',
  REVISION_REQUESTED: 'يحتاج مراجعة',
  DRAFT: 'مسودة',
};

const ACTION_PRIORITY: Record<SupervisorNextAction | 'REVIEW' | 'HISTORICAL', number> = {
  START_APPROVAL: 0,
  COMPLETION_APPROVAL: 1,
  EVALUATION: 2,
  FEEDBACK: 3,
  REVIEW: 4,
  NONE: 5,
  HISTORICAL: 6,
};

type DutyDisplay = {
  id: string;
  starts_at: string;
  ends_at: string;
};

type SupervisorSheetView = {
  duty: DutyDisplay | null;
  items: SupervisorDailySheetItemDto[];
  historical: boolean;
};

type DisplayAction = SupervisorNextAction | 'REVIEW' | 'HISTORICAL';

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeZone: 'Asia/Riyadh' }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ar', { timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value.replaceAll('_', ' ');
}

function actionForItem(item: SupervisorDailySheetItemDto): DisplayAction {
  if (item.next_action === 'NONE') return 'NONE';
  const actionMap: Partial<Record<SupervisorNextAction, SupervisorDailySheetItemDto['allowedActions'][number]>> = {
    START_APPROVAL: 'START_APPROVAL',
    COMPLETION_APPROVAL: 'COMPLETION_APPROVAL',
    EVALUATION: 'CASESHEET_EVALUATION',
    FEEDBACK: 'CLINICAL_FEEDBACK',
  };
  const requiredAction = actionMap[item.next_action];
  return requiredAction && item.allowedActions.includes(requiredAction) ? item.next_action : 'REVIEW';
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge status-${normalized}`} aria-label={`الحالة: ${statusLabel(value)}`}>{statusLabel(value)}</span>;
}

function ActionBadge({ action }: { action: DisplayAction }) {
  const normalized = action.toLowerCase().replaceAll('_', '-');
  return <span className={`next-action-badge action-${normalized}`} aria-label={`الإجراء المطلوب: ${ACTION_LABELS[action]}`}>
    {ACTION_LABELS[action]}
  </span>;
}

function DailySheetTable({ items, historical }: { items: SupervisorDailySheetItemDto[]; historical: boolean }) {
  if (!items.length) {
    return <EmptyState title="لا يوجد طلاب أو حالات" description={historical ? 'لا توجد حالات مسجلة لهذا اليوم.' : 'لا توجد حالات مرتبطة بالمناوبة الحالية حتى الآن.'} />;
  }

  const orderedItems = [...items].sort((left, right) => {
    const leftAction: DisplayAction = historical ? 'HISTORICAL' : actionForItem(left);
    const rightAction: DisplayAction = historical ? 'HISTORICAL' : actionForItem(right);
    return ACTION_PRIORITY[leftAction] - ACTION_PRIORITY[rightAction] || left.student_display_name.localeCompare(right.student_display_name, 'ar');
  });

  return <div className="table-wrap">
    <table className="data-table supervisor-daily-sheet">
      <thead>
        <tr>
          <th>الطالب</th>
          <th>الرقم الجامعي</th>
          <th>المادة / القسم</th>
          <th>البدء</th>
          <th>الكاسشيت</th>
          <th>الإنهاء</th>
          <th>التقييم</th>
          <th>الإجراء المطلوب</th>
        </tr>
      </thead>
      <tbody>
        {orderedItems.map((item) => {
          const action: DisplayAction = historical ? 'HISTORICAL' : actionForItem(item);
          return <tr key={item.snapshot_id}>
            <td data-label="الطالب"><strong>{item.student_display_name}</strong></td>
            <td data-label="الرقم الجامعي">{item.student_number}</td>
            <td data-label="المادة / القسم">
              <strong>{item.subject_name ?? 'غير محدد'}</strong>
              <small className="table-subtext">{item.department_name}</small>
            </td>
            <td data-label="البدء"><Status value={item.start_status} /></td>
            <td data-label="الكاسشيت"><Status value={item.case_status} /></td>
            <td data-label="الإنهاء"><Status value={item.completion_status} /></td>
            <td data-label="التقييم">
              {item.evaluation_score === null ? <Status value={item.evaluation_status} /> : <span className="grade-value">{item.evaluation_score} / 10</span>}
            </td>
            <td data-label="الإجراء المطلوب">
              <div className="row-actions">
                <ActionBadge action={action} />
                <button type="button" className="button ghost" onClick={() => navigate(`/supervisor/cases/${item.snapshot_id}`)}>
                  {historical ? 'فتح السجل' : action === 'NONE' ? 'فتح التفاصيل' : 'فتح للتنفيذ'}
                </button>
              </div>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export function SupervisorDailySheetPage() {
  const [selectedDate, setSelectedDate] = useState(todayInRiyadh);
  const today = todayInRiyadh();
  const isToday = selectedDate === today;

  const sheetRes = useResource<SupervisorSheetView>(async () => {
    if (isToday) {
      const response = await api.supervisorDailySheet();
      return {
        duty: response.duty ? { id: response.duty.id, starts_at: response.duty.starts_at, ends_at: response.duty.ends_at } : null,
        items: response.items,
        historical: false,
      };
    }
    const response = await api.supervisorHistoryDay(selectedDate);
    return {
      duty: response.shifts[0] ? { id: response.shifts[0].shift_id, starts_at: response.shifts[0].starts_at, ends_at: response.shifts[0].ends_at } : null,
      items: response.items,
      historical: true,
    };
  }, [selectedDate, isToday]);
  const upcomingRes = useResource(() => api.supervisorUpcomingDuties(), []);

  const view = sheetRes.data;
  const hasDuty = Boolean(view?.duty);

  return <>
    <PageHeader
      eyebrow="CLINICAL SUPERVISOR"
      title="اليوم والمناوبة"
      description="كشف العمل السريري للمشرف ضمن المناوبة اليومية، مع إبقاء الإجراءات خاضعة لصلاحيات الخادم."
      actions={
        <label className="date-picker-field">
          <span>عرض يوم</span>
          <input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value || today)} aria-label="اختيار يوم كشف المشرف" />
        </label>
      }
    />

    {sheetRes.loading ? <LoadingState label="جارٍ تحميل كشف المناوبة من الخادم…" /> : sheetRes.error ? <ErrorState error={sheetRes.error} onRetry={() => sheetRes.reload()} /> : <>
      <section className="supervisor-duty-strip" aria-label="حالة المناوبة">
        <div>
          <span className="eyebrow">{view?.historical ? 'HISTORICAL DUTY' : 'CURRENT DUTY'}</span>
          <h2>{view?.historical ? `سجل ${formatDate(selectedDate)}` : 'حالة المناوبة'}</h2>
          <p>{hasDuty ? `${formatTime(view!.duty!.starts_at)} — ${formatTime(view!.duty!.ends_at)}` : 'لا توجد مناوبة مرتبطة بهذا اليوم.'}</p>
          {view?.historical ? <span className="historical-mode-note">عرض تاريخي — للقراءة فقط، لا توجد إجراءات تشغيلية</span> : null}
        </div>
        <div className="supervisor-duty-status">
          <span className={`duty-status-dot ${hasDuty && isToday ? 'is-active' : ''}`} aria-hidden="true" />
          <strong>{hasDuty ? (isToday ? 'نشط الآن' : 'يوم سابق') : 'خارج المناوبة'}</strong>
          <small>{formatDate(selectedDate)}</small>
        </div>
      </section>

      {!hasDuty ? <section className="surface">
        <EmptyState title="لا توجد مناوبة لهذا اليوم" description={isToday ? 'لا توجد مناوبة نشطة للمشرف حاليًا. يمكنك مراجعة المناوبات القادمة أدناه.' : 'لا توجد مناوبة مسجلة للمشرف في اليوم المحدد.'} />
      </section> : <section className="surface">
        <div className="surface-heading">
          <div>
            <span className="eyebrow">DAILY CLINICAL SHEET</span>
            <h2>{view?.historical ? 'كشف الحالات في اليوم المحدد' : 'كشف الطلاب والحالات اليوم'}</h2>
          </div>
          <span className="sheet-count">{view?.items.length ?? 0} حالة</span>
        </div>
        <DailySheetTable items={view?.items ?? []} historical={view?.historical ?? false} />
      </section>}

      {isToday && upcomingRes.data?.length ? <section className="surface">
        <div className="surface-heading">
          <div>
            <span className="eyebrow">UPCOMING DUTIES</span>
            <h2>المناوبات القادمة</h2>
          </div>
        </div>
        {upcomingRes.error ? <p className="secondary-data-warning">تعذر تحميل المناوبات القادمة. كشف اليوم يعمل بشكل مستقل.</p> : <div className="upcoming-duty-list">
          {upcomingRes.data.slice(0, 3).map((duty) => <article key={duty.id} className="upcoming-duty-item">
            <strong>{formatDateTime(duty.starts_at)}</strong>
            <span>{formatTime(duty.starts_at)} — {formatTime(duty.ends_at)}</span>
          </article>)}
        </div>}
      </section> : null}
      {isToday && upcomingRes.error && !upcomingRes.data?.length ? <section className="secondary-data-warning">تعذر تحميل المناوبات القادمة. يمكنك متابعة كشف اليوم دون هذا القسم.</section> : null}
    </>}
  </>;
}
