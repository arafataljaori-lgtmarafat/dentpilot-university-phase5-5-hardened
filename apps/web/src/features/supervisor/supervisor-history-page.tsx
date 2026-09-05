import { useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import type { SupervisorHistoryDayItemDto } from '@dentpilot/contracts';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلق',
  SUBMITTED: 'مرسل',
  APPROVED_START: 'بدأ',
  APPROVED_FINAL: 'منتهٍ',
  GRADED: 'مقيّم',
  REVISION_REQUESTED: 'يحتاج مراجعة',
  DRAFT: 'مسودة',
};

function yesterdayInRiyadh(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ar', { timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
}

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value.replaceAll('_', ' ');
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge status-${normalized}`} aria-label={`الحالة: ${statusLabel(value)}`}>{statusLabel(value)}</span>;
}

function HistoryTable({ items }: { items: SupervisorHistoryDayItemDto[] }) {
  if (!items.length) return <EmptyState title="لا توجد حالات في هذا اليوم" description="لا توجد حالات مرتبطة بالمناوبات أو الأعمال المسجلة للمشرف في التاريخ المحدد." />;

  return <div className="table-wrap">
    <table className="data-table supervisor-history-table">
      <thead>
        <tr>
          <th>الطالب</th>
          <th>الرقم الجامعي</th>
          <th>المادة / القسم</th>
          <th>حالة العمل</th>
          <th>البدء</th>
          <th>الإنهاء</th>
          <th>التقييم</th>
          <th>ما تم / المعلق</th>
        </tr>
      </thead>
        <tbody>
        {items.map((item) => <tr key={item.snapshot_id}>
          <td data-label="الطالب"><strong>{item.student_display_name}</strong></td>
          <td data-label="الرقم الجامعي">{item.student_number}</td>
          <td data-label="المادة / القسم">
            <strong>{item.subject_name ?? 'غير محدد'}</strong>
            <small className="table-subtext">{item.department_name}</small>
          </td>
          <td data-label="حالة العمل"><Status value={item.status_at_day_end} /></td>
          <td data-label="البدء"><Status value={item.start_status} /></td>
          <td data-label="الإنهاء"><Status value={item.completion_status} /></td>
          <td data-label="التقييم">
            {item.evaluation_score === null ? <Status value={item.evaluation_status} /> : <span className="grade-value">{item.evaluation_score} / 10</span>}
          </td>
          <td data-label="ما تم / المعلق">
            <span className={item.remained_pending ? 'queue-availability is-deferred' : 'queue-availability is-available'}>{item.remained_pending ? 'بقي معلقًا' : 'لا يوجد معلق'}</span>
            {item.performed_actions.length ? <small className="table-subtext">{item.performed_actions.join(' · ')}</small> : null}
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

export function SupervisorHistoryPage() {
  const [selectedDate, setSelectedDate] = useState(yesterdayInRiyadh);
  const today = todayInRiyadh();
  const historyRes = useResource(() => api.supervisorHistoryDay(selectedDate), [selectedDate]);
  const capabilitiesRes = useResource(() => api.supervisorCapabilities(), []);

  if (historyRes.loading || capabilitiesRes.loading) return <LoadingState label="جارٍ تحميل السجل التاريخي من الخادم…" />;
  if (historyRes.error) return <ErrorState error={historyRes.error} onRetry={() => historyRes.reload()} />;
  if (capabilitiesRes.error) return <ErrorState error={capabilitiesRes.error} onRetry={() => capabilitiesRes.reload()} />;

  if (!capabilitiesRes.data?.capabilities.includes('HISTORY_READ')) {
    return <>
      <PageHeader eyebrow="CLINICAL SUPERVISOR" title="السجل التاريخي" description="عرض أعمال المشرف في الأيام السابقة للقراءة والمراجعة فقط." />
      <EmptyState title="لا توجد صلاحية لعرض السجل التاريخي" description="لم يمنح الخادم حسابك capability قراءة سجل المشرف التاريخي." />
    </>;
  }

  const history = historyRes.data;
  if (!history) return <EmptyState title="لا تتوفر بيانات تاريخية" description="لم يُعد الخادم سجلًا لهذا التاريخ." />;

  return <>
    <PageHeader
      eyebrow="SUPERVISOR HISTORY"
      title="السجل التاريخي"
      description="مراجعة ما تم إنجازه وما بقي معلقًا في يوم سابق، دون أي إجراءات تشغيلية أو تعديلات."
      actions={<label className="date-picker-field"><span>اختر يومًا سابقًا</span><input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value || yesterdayInRiyadh())} aria-label="اختيار يوم سابق للسجل التاريخي" /></label>}
    />

    <section className="historical-mode-banner" aria-label="وضع العرض التاريخي">
      <strong>عرض تاريخي للقراءة فقط</strong>
      <span>{formatDate(history.date)}</span>
      <small>لا توجد أزرار اعتماد أو تعديل أو إجراءات تشغيلية في هذا القسم.</small>
    </section>

    <section className="surface">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">DUTY RECORD</span>
          <h2>مناوبات اليوم المحدد</h2>
        </div>
        <span className="sheet-count">{history.shifts.length} مناوبة</span>
      </div>
      {history.shifts.length ? <div className="history-shift-list">{history.shifts.map((shift) => <article key={shift.shift_id} className="history-shift-item">
        <strong>{formatTime(shift.starts_at)} — {formatTime(shift.ends_at)}</strong>
        <span className={`status-badge status-${shift.status.toLowerCase()}`}>{statusLabel(shift.status)}</span>
      </article>)}</div> : <EmptyState title="لا توجد مناوبة مسجلة" description="لم تسجل مناوبة للمشرف في اليوم المختار." />}
    </section>

    <section className="surface">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">HISTORICAL CLINICAL SHEET</span>
          <h2>كشف أعمال اليوم</h2>
        </div>
        <span className="sheet-count">{history.items.length} حالة</span>
      </div>
      <HistoryTable items={history.items} />
    </section>
  </>;
}
