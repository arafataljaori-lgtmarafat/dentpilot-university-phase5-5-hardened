import { useState } from 'react';
import { api } from '../../api/client';
import { ErrorState } from '../../components/ui';

export function EvaluationForm({ snapshotId, onSuccess }: { snapshotId: string; onSuccess: () => void }) {
  const [score, setScore] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (score === '' || score < 0 || score > 10) return;
    
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await api.supervisorEvaluate(snapshotId, Number(score), idempotencyKey);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('تعذر حفظ التقييم.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="action-form">
      <h3>تقييم الحالة</h3>
      <p>أدخل تقييماً من 0 إلى 10 بناءً على المعايير السريرية.</p>
      
      {error && <ErrorState error={error} onRetry={() => setError(null)} />}
      
      <div className="field">
        <label>الدرجة (0-10)</label>
        <input 
          type="number" 
          min="0" 
          max="10" 
          step="0.5"
          value={score} 
          onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))} 
          required 
          disabled={loading}
        />
      </div>

      <button type="submit" className="button primary" disabled={loading || score === '' || score < 0 || score > 10}>
        {loading ? 'جاري الحفظ...' : 'حفظ التقييم'}
      </button>
    </form>
  );
}
