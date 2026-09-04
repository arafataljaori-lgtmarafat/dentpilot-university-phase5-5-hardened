import { useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

export function SupervisorListControlPage() {
  const { data, error, loading, reload } = useResource(() => api.controlSupervisors(), []);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const supervisors = data?.items || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setInviting(true);
    try {
      await api.controlIssueInvitation(email, 'CLINICAL_SUPERVISOR');
      setEmail('');
      reload();
    } catch (err) {
      console.error('Failed to invite supervisor', err);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="supervisor-list-page">
      <PageHeader
        eyebrow="الجامعة"
        title="إدارة المشرفين السريريين"
        description="إدارة حسابات المشرفين ودعواتهم للصلاحيات السريرية"
      />

      <div className="card form-card" style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface-color)', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>دعوة مشرف جديد</h3>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="البريد الإلكتروني..."
            className="input"
            required
            disabled={inviting}
            style={{ flex: 1 }}
          />
          <button type="submit" className="button" disabled={inviting}>
            {inviting ? 'جاري الإرسال...' : 'إرسال دعوة'}
          </button>
        </form>
      </div>

      <div className="card table-card" style={{ background: 'var(--surface-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '12px 16px' }}>الاسم</th>
              <th style={{ padding: '12px 16px' }}>البريد الإلكتروني</th>
              <th style={{ padding: '12px 16px' }}>الحالة</th>
              <th style={{ padding: '12px 16px' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {supervisors.map((sv) => (
              <tr key={sv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{sv.display_name}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{sv.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span className={`badge ${sv.active ? 'success' : 'neutral'}`} style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    background: sv.active ? 'var(--success-bg, #e6f4ea)' : 'var(--neutral-bg, #f1f3f4)',
                    color: sv.active ? 'var(--success-fg, #137333)' : 'var(--neutral-fg, #5f6368)'
                  }}>
                    {sv.active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() => navigate(`/control/supervisors/${sv.id}`)}
                  >
                    عرض التفاصيل
                  </button>
                </td>
              </tr>
            ))}
            {supervisors.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  لا يوجد مشرفين
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
