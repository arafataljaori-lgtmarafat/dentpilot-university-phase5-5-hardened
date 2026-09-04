import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SupervisorHomePage() {
  const dutyRes = useResource(() => api.supervisorActiveDuty(), []);
  const upcomingRes = useResource(() => api.supervisorUpcomingDuties(), []);
  const casesRes = useResource(() => api.supervisorDutyCases(), []);

  const loading = dutyRes.loading || upcomingRes.loading || casesRes.loading;
  const error = dutyRes.error || upcomingRes.error || casesRes.error;

  const hasActiveDuty = dutyRes.data && dutyRes.data.length > 0;
  const activeDuty = hasActiveDuty ? dutyRes.data![0] : null;

  return <>
    <PageHeader 
      eyebrow="CLINICAL WORKSPACE" 
      title="المساحة السريرية" 
      description="مساحة عمل المشرف السريري لإدارة الحالات النشطة ضمن المناوبة الحالية."
    />
    
    {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => { dutyRes.reload(); upcomingRes.reload(); casesRes.reload(); }} /> : <>
      <section className="metric-grid">
        <MetricCard 
          label="حالة المناوبة" 
          value={hasActiveDuty ? 'نشط الآن' : 'خارج المناوبة'} 
          hint={activeDuty ? `تنتهي في ${new Date(activeDuty.ends_at).toLocaleTimeString('ar')}` : 'لا توجد مناوبة حالية'} 
          tone={hasActiveDuty ? 'blue' : undefined} 
        />
        {hasActiveDuty && casesRes.data && (
          <MetricCard 
            label="حالات تتطلب إجراء" 
            value={casesRes.data.length} 
            hint="ضمن نطاق المناوبة" 
            tone="gold" 
          />
        )}
      </section>

      {!hasActiveDuty ? (
        <section className="surface">
          <div className="surface-heading">
            <div>
              <span className="eyebrow">UPCOMING</span>
              <h2>المناوبات القادمة</h2>
            </div>
          </div>
          {upcomingRes.data && upcomingRes.data.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>يبدأ</th>
                  <th>ينتهي</th>
                </tr>
              </thead>
              <tbody>
                {upcomingRes.data.map(shift => (
                  <tr key={shift.id}>
                    <td>{new Date(shift.starts_at).toLocaleDateString('ar')}</td>
                    <td>{new Date(shift.starts_at).toLocaleTimeString('ar')}</td>
                    <td>{new Date(shift.ends_at).toLocaleTimeString('ar')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="لا توجد مناوبات قادمة" description="ليس لديك مناوبات سريرية مجدولة في المستقبل القريب." />
          )}
        </section>
      ) : (
        <section className="surface">
          <div className="surface-heading">
            <div>
              <span className="eyebrow">ACTIVE DUTY</span>
              <h2>الحالات النشطة</h2>
            </div>
            <button className="button" onClick={() => navigate('/supervisor/queue')}>إدارة طابور الحالات</button>
          </div>
          {casesRes.data && casesRes.data.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>المعرف</th>
                  <th>الحالة</th>
                  <th>الطالب</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {casesRes.data.slice(0, 5).map(c => (
                  <tr key={c.snapshot_id}>
                    <td>{c.snapshot_id.split('-')[0]}</td>
                    <td><span className="status-badge" data-status={c.current_status}>{c.current_status}</span></td>
                    <td>الحالة ضمن المناوبة</td>
                    <td><button className="button ghost" onClick={() => navigate(`/supervisor/cases/${c.snapshot_id}`)}>تفاصيل</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="لا توجد حالات" description="لا يوجد أي حالات نشطة ضمن نطاق هذه المناوبة السريرية." />
          )}
          {casesRes.data && casesRes.data.length > 5 && (
            <div style={{ padding: '1rem', textAlign: 'center' }}>
              <button className="button ghost" onClick={() => navigate('/supervisor/queue')}>عرض كل الحالات ({casesRes.data.length})</button>
            </div>
          )}
        </section>
      )}
    </>}
  </>;
}
