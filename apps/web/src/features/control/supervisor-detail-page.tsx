import { useState } from 'react';
import { api, newIdempotencyKey } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SupervisorDetailControlPage({ id }: { id: string }) {
  const supervisorRes = useResource(() => api.controlSupervisorDetail(id), [id]);
  const grantsRes = useResource(() => api.controlSupervisorGrants(id), [id]);
  
  const [toggling, setToggling] = useState(false);

  if (supervisorRes.loading || grantsRes.loading) return <LoadingState />;
  if (supervisorRes.error) return <ErrorState error={supervisorRes.error} onRetry={supervisorRes.reload} />;
  if (grantsRes.error) return <ErrorState error={grantsRes.error} onRetry={grantsRes.reload} />;

  const sv = supervisorRes.data;
  const grants = grantsRes.data?.items || [];

  const handleToggleStatus = async () => {
    setToggling(true);
    try {
      await api.controlSetSupervisorStatus(id, !sv.active, newIdempotencyKey());
      supervisorRes.reload();
    } catch (err) {
      console.error('Failed to toggle status', err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="supervisor-detail-page">
      <PageHeader
        eyebrow="الجامعة"
        title={sv.display_name}
        description={sv.email}
        actions={
          <button className="button ghost" onClick={() => navigate('/control/supervisors')}>
            العودة للقائمة
          </button>
        }
      />

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginTop: '24px' }}>
        
        {/* Profile Card */}
        <div className="card" style={{ background: 'var(--surface-color)', padding: '24px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>بيانات الحساب</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <small style={{ color: 'var(--text-secondary)' }}>الاسم</small>
              <div>{sv.display_name}</div>
            </div>
            <div>
              <small style={{ color: 'var(--text-secondary)' }}>البريد الإلكتروني</small>
              <div>{sv.email}</div>
            </div>
            <div>
              <small style={{ color: 'var(--text-secondary)' }}>الحالة</small>
              <div style={{ marginTop: '4px' }}>
                <span className={`badge ${sv.active ? 'success' : 'neutral'}`} style={{
                  padding: '4px 8px', borderRadius: '4px', fontSize: '0.875rem',
                  background: sv.active ? 'var(--success-bg, #e6f4ea)' : 'var(--neutral-bg, #f1f3f4)',
                  color: sv.active ? 'var(--success-fg, #137333)' : 'var(--neutral-fg, #5f6368)'
                }}>
                  {sv.active ? 'نشط' : 'غير نشط'}
                </span>
              </div>
            </div>
            
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button 
                type="button" 
                className={`button ${sv.active ? 'danger' : 'primary'}`} 
                onClick={handleToggleStatus}
                disabled={toggling}
                style={{ width: '100%' }}
              >
                {toggling ? 'جاري...' : (sv.active ? 'إيقاف الحساب' : 'تفعيل الحساب')}
              </button>
            </div>
          </div>
        </div>

        {/* Permissions / Grants */}
        <div className="card" style={{ background: 'var(--surface-color)', padding: '24px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>الصلاحيات والتكليفات</h3>
          
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px' }}>الصلاحية</th>
                <th style={{ padding: '12px 16px' }}>تاريخ المنح</th>
                <th style={{ padding: '12px 16px' }}>تاريخ الإلغاء</th>
                <th style={{ padding: '12px 16px' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant: any) => (
                <tr key={grant.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{grant.permission_set_version_id}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                    {new Date(grant.granted_at).toLocaleDateString('ar-EG')}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                    {grant.revoked_at ? new Date(grant.revoked_at).toLocaleDateString('ar-EG') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {!grant.revoked_at && (
                      <button className="button danger small" onClick={async () => {
                        if (confirm('هل أنت متأكد من إلغاء الصلاحية؟')) {
                          await api.controlRevokePermission(grant.id, newIdempotencyKey());
                          grantsRes.reload();
                        }
                      }}>إلغاء</button>
                    )}
                  </td>
                </tr>
              ))}
              {grants.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    لا توجد صلاحيات ممنوحة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 16px 0' }}>منح صلاحية جديدة</h4>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              في هذه المرحلة (Phase 5) يتم الإدارة بواسطة الـ Backend مباشرة، يمكنك فقط رؤية الصلاحيات أو إلغائها هنا إن وجدت تكليفات مسبقة.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
