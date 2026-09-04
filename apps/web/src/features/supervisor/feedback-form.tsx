import { useState } from 'react';
import { api } from '../../api/client';
import { ErrorState } from '../../components/ui';

export function FeedbackForm({ snapshotId, onSuccess }: { snapshotId: string; onSuccess: () => void }) {
  const [body, setBody] = useState('');
  const [studentVisible, setStudentVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api.supervisorFeedback(snapshotId, body, studentVisible, idempotencyKey);
      setBody('');
      onSuccess();
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="action-form">
      <h3>إضافة ملاحظات سريرية</h3>
      
      {error && <ErrorState error={error} onRetry={() => setError(null)} />}
      
      <div className="field">
        <label>الملاحظة</label>
        <textarea 
          value={body} 
          onChange={(e) => setBody(e.target.value)} 
          required 
          disabled={loading}
          rows={3}
        />
      </div>

      <div className="field-inline">
        <input 
          type="checkbox" 
          id="studentVisible"
          checked={studentVisible} 
          onChange={(e) => setStudentVisible(e.target.checked)} 
          disabled={loading}
        />
        <label htmlFor="studentVisible">مرئي للطالب</label>
      </div>

      <button type="submit" className="button primary" disabled={loading || !body.trim()}>
        {loading ? 'جاري الحفظ...' : 'إضافة الملاحظة'}
      </button>
    </form>
  );
}
