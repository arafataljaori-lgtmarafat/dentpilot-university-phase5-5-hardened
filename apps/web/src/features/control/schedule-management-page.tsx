import { useState } from 'react';
import { api, newIdempotencyKey } from '../../api/client';
import type { DutyShiftDto } from '@dentpilot/contracts';
import { useResource } from '../../api/use-resource';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SchedulesControlPage() {
  const { data, error, loading, reload } = useResource(() => api.controlSchedules(), []);

  const [creating, setCreating] = useState(false);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const schedules = data?.items || [];

  return (
    <div className="schedules-page">
      <PageHeader
        eyebrow="الجامعة"
        title="الجداول الزمنية السريرية"
        description="إدارة جداول المناوبات السريرية للمشرفين وتوزيعهم"
        actions={
          <button className="button primary" disabled={creating} onClick={() => alert('إنشاء جدول جديد غير مدعوم في هذه الواجهة التجريبية')}>
            إنشاء جدول جديد
          </button>
        }
      />

      <div className="card table-card" style={{ background: 'var(--surface-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px 16px' }}>رقم الجدول</th>
              <th style={{ padding: '12px 16px' }}>يبدأ من</th>
              <th style={{ padding: '12px 16px' }}>ينتهي في</th>
              <th style={{ padding: '12px 16px' }}>المنطقة الزمنية</th>
              <th style={{ padding: '12px 16px' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((sch) => (
              <tr key={sch.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {sch.id.split('-')[0]}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {new Date(sch.valid_from).toLocaleDateString('ar-EG')}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {new Date(sch.valid_to).toLocaleDateString('ar-EG')}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                  {sch.timezone}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() => navigate(`/control/schedules/${sch.id}`)}
                  >
                    التفاصيل والمناوبات
                  </button>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  لا توجد جداول زمنية مسجلة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleDetailControlPage({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource(() => api.controlScheduleDetail(id), [id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const schedule = data;
  if (!schedule) return <div>لا توجد بيانات للجدول</div>;
  const shifts = schedule.shifts;

  // Group shifts by day
  const groupedShifts = shifts.reduce<Record<string, DutyShiftDto[]>>((acc, shift) => {
    const day = new Date(shift.starts_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[day]) acc[day] = [];
    acc[day].push(shift);
    return acc;
  }, {});

  return (
    <div className="schedule-detail-page">
      <PageHeader
        eyebrow="الجامعة"
        title={`جدول المناوبات: ${schedule.id.split('-')[0]}`}
        description={`من ${new Date(schedule.valid_from).toLocaleDateString('ar-EG')} إلى ${new Date(schedule.valid_to).toLocaleDateString('ar-EG')}`}
        actions={
          <button className="button ghost" onClick={() => navigate('/control/schedules')}>
            العودة للقائمة
          </button>
        }
      />

      <div className="card" style={{ background: 'var(--surface-color)', padding: '24px', borderRadius: '8px', marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>المناوبات الأسبوعية وتوزيع المشرفين</h3>
          <button className="button primary" disabled onClick={() => alert('إضافة مناوبة غير مدعوم في هذه الواجهة التجريبية')}>إضافة مناوبة</button>
        </div>

        {Object.entries(groupedShifts).length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>لا توجد مناوبات في هذا الجدول</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {Object.entries(groupedShifts).map(([day, dayShifts]) => (
              <div key={day} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: 'var(--bg-color)', padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)' }}>
                  {day}
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {dayShifts.map((shift) => (
                    <div key={shift.id} style={{ display: 'flex', gap: '24px', paddingBottom: '16px', borderBottom: '1px dashed var(--border-color)' }}>
                      <div style={{ minWidth: '150px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {new Date(shift.starts_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} - {new Date(shift.ends_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                          الحالة: <span style={{ color: shift.status === 'ACTIVE' ? 'var(--success-fg, #137333)' : 'inherit' }}>{shift.status === 'ACTIVE' ? 'نشط' : 'ملغى'}</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>المشرفون المعينون:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {shift.members?.map((m) => (
                            <div key={m.member_id} style={{ background: 'var(--neutral-bg, #f1f3f4)', padding: '4px 12px', borderRadius: '16px', fontSize: '0.875rem' }}>
                              👤 {m.supervisor_name}
                            </div>
                          ))}
                          {(!shift.members || shift.members.length === 0) && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>لا يوجد مشرفين (مناوبة شاغرة)</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <button className="button ghost small" disabled onClick={() => alert('تعديل المناوبة')}>تعديل</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
