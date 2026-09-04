import { useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SupervisorQueuePage() {
  const casesRes = useResource(() => api.supervisorDutyCases(), []);
  const [filter, setFilter] = useState<string>('ALL');

  const filteredCases = casesRes.data?.filter(c => {
    if (filter === 'ALL') return true;
    return c.current_status === filter;
  });

  return <>
    <PageHeader 
      eyebrow="CLINICAL QUEUE" 
      title="طابور الحالات السريرية" 
      description="إدارة جميع الحالات التي تتطلب انتباه المشرف ضمن المناوبة الحالية."
      actions={
        <div className="filter-row compact">
          <label>تصفية:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">الكل</option>
            <option value="AWAITING_START_APPROVAL">بانتظار الإذن بالبدء</option>
            <option value="AWAITING_FINAL_APPROVAL">بانتظار الاعتماد النهائي</option>
            <option value="AWAITING_EVALUATION">بانتظار التقييم</option>
            <option value="APPROVED_FINAL">مكتملة</option>
          </select>
        </div>
      }
    />
    
    {casesRes.loading ? <LoadingState /> : casesRes.error ? <ErrorState error={casesRes.error} onRetry={casesRes.reload} /> : <>
      <section className="surface">
        {filteredCases && filteredCases.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>المعرف</th>
                <th>الحالة</th>
                <th>الطالب</th>
                <th>الوقت</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map(c => (
                <tr key={c.snapshot_id}>
                  <td>{c.snapshot_id.split('-')[0]}</td>
                  <td><span className="status-badge" data-status={c.current_status}>{c.current_status}</span></td>
                  <td>الحالة ضمن المناوبة</td>
                  <td>—</td>
                  <td><button className="button ghost" onClick={() => navigate(`/supervisor/cases/${c.snapshot_id}`)}>تفاصيل / إجراء</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="لا توجد حالات" description="لا يوجد أي حالات تطابق معايير التصفية المحددة." />
        )}
      </section>
    </>}
  </>;
}
