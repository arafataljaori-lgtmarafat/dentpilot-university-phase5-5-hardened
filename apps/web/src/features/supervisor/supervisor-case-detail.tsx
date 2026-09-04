import { useState } from 'react';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';
import { EvaluationForm } from './evaluation-form';
import { FeedbackForm } from './feedback-form';

export function SupervisorCaseDetail({ id }: { id: string }) {
  const caseRes = useResource(() => api.supervisorCaseDetail(id), [id]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  const handleApproveStart = async () => {
    if (!confirm('هل أنت متأكد من منح الإذن بالبدء لهذه الحالة؟')) return;
    setLoadingAction('START');
    setActionError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api.supervisorApproveStart(id, idempotencyKey);
      await caseRes.reload();
    } catch (err: any) {
      setActionError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApproveCompletion = async () => {
    if (!confirm('هل أنت متأكد من اعتماد اكتمال هذه الحالة السريرية؟')) return;
    setLoadingAction('COMPLETION');
    setActionError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api.supervisorApproveCompletion(id, idempotencyKey);
      await caseRes.reload();
    } catch (err: any) {
      setActionError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  if (caseRes.loading) return <LoadingState />;
  if (caseRes.error) return <ErrorState error={caseRes.error} onRetry={caseRes.reload} />;
  
  const c = caseRes.data;
  if (!c) return <div>لا توجد بيانات</div>;

  const currentStatus = c.current_status;
  const allowedActions = c.allowedActions || [];

  // Determine action availability entirely from server-provided capabilities
  const canApproveStart = allowedActions.includes('START_APPROVAL');
  const canApproveCompletion = allowedActions.includes('COMPLETION_APPROVAL');
  const canEvaluate = allowedActions.includes('CASESHEET_EVALUATION');
  const canFeedback = allowedActions.includes('CLINICAL_FEEDBACK');

  return <>
    <PageHeader 
      eyebrow="CASE DETAIL" 
      title={`تفاصيل الحالة: ${id.split('-')[0]}`}
      description="استعراض الحالة وتنفيذ الإجراءات السريرية المخولة."
      actions={<button className="button ghost" onClick={() => navigate('/supervisor/queue')}>عودة للطابور</button>}
    />

    {actionError && <ErrorState error={actionError} onRetry={() => setActionError(null)} />}

    <div className="layout-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
      <div className="main-col">
        <section className="surface">
          <div className="surface-heading">
            <h2>البيانات الأساسية</h2>
          </div>
          <dl className="data-list">
            <div><dt>معرف اللقطة (Snapshot ID)</dt><dd>{c.id}</dd></div>
            <div><dt>الحالة السريرية الحالية</dt><dd><span className="status-badge" data-status={currentStatus}>{currentStatus}</span></dd></div>
            <div><dt>الطالب</dt><dd>{c.student_name || 'غير متوفر'}</dd></div>
            <div><dt>القسم</dt><dd>{c.department_name || 'غير متوفر'}</dd></div>
          </dl>
        </section>

        <section className="surface">
          <div className="surface-heading">
            <h2>ملاحظات سريرية سابقة</h2>
          </div>
          {/* If the API returns past feedback, map it here. Assuming c.feedback is an array for demonstration, or handled later. */}
          {c.feedback && c.feedback.length > 0 ? (
            <ul>
              {c.feedback.map((f: any, i: number) => <li key={i}>{f.body}</li>)}
            </ul>
          ) : (
            <p>لا توجد ملاحظات مسجلة.</p>
          )}
        </section>
      </div>

      <div className="side-col">
        <section className="surface">
          <div className="surface-heading">
            <h2>الإجراءات السريرية</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {canApproveStart && (
              <button 
                className="button primary" 
                onClick={handleApproveStart}
                disabled={loadingAction !== null}
              >
                {loadingAction === 'START' ? 'جاري التنفيذ...' : 'الإذن بالبدء'}
              </button>
            )}

            {canApproveCompletion && (
              <button 
                className="button primary" 
                onClick={handleApproveCompletion}
                disabled={loadingAction !== null}
              >
                {loadingAction === 'COMPLETION' ? 'جاري التنفيذ...' : 'اعتماد الاكتمال'}
              </button>
            )}
          </div>
          
          {!canApproveStart && !canApproveCompletion && !canEvaluate && (
            <div className="empty-state">
              <p>لا توجد إجراءات متاحة لهذه الحالة حالياً.</p>
            </div>
          )}
        </section>

        {canEvaluate && (
          <section className="surface">
            <EvaluationForm snapshotId={id} onSuccess={() => caseRes.reload()} />
          </section>
        )}

        {canFeedback && (
          <section className="surface">
            <FeedbackForm snapshotId={id} onSuccess={() => caseRes.reload()} />
          </section>
        )}
      </div>
    </div>
  </>;
}
