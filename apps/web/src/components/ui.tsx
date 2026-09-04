import type { ReactNode } from 'react';
import { ApiClientError } from '../api/client';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </header>;
}

export function LoadingState({ label = 'جارٍ تحميل البيانات من الخادم…' }: { label?: string }) {
  return <div className="state-card loading-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> <b>{label}</b></div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="state-card empty-state"><span className="state-icon">◇</span><h2>{title}</h2><p>{description}</p></div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiClientError ? error : undefined;
  const titles: Record<number, string> = {
    0: 'تعذر الاتصال بالخادم',
    401: 'انتهت الجلسة',
    403: 'الوصول غير مسموح',
    404: 'السجل غير موجود',
    409: 'تعارض في الحالة',
    429: 'طلبات كثيرة',
  };
  const title = apiError ? titles[apiError.status] ?? 'تعذر تنفيذ الطلب' : 'تعذر تحميل البيانات';
  const message = apiError?.message ?? 'حدث خطأ غير متوقع. أعد المحاولة.';
  const details = apiError?.details ? Object.entries(apiError.details).flatMap(([field, messages]) => messages.map((item) => `${field}: ${item}`)) : [];
  return <div className="state-card error-state" role="alert">
    <span className="state-icon" aria-hidden="true">!</span><h2>{title}</h2><p>{message}</p>
    {details.length ? <ul className="error-details">{details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
    {apiError?.requestId ? <small>Request ID: {apiError.requestId}</small> : null}
    {onRetry ? <button type="button" className="button secondary" onClick={onRetry}>إعادة المحاولة</button> : null}
  </div>;
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return <span className={`status-badge status-${normalized}`} aria-label={`الحالة: ${value.replaceAll('_', ' ')}`}>{value.replaceAll('_', ' ')}</span>;
}

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return <div className="pager">
    <span>{total} سجل</span>
    <div><button type="button" className="icon-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button><b aria-live="polite">{page} / {Math.max(totalPages, 1)}</b><button type="button" className="icon-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>التالي</button></div>
  </div>;
}

export function MetricCard({ label, value, hint, tone = 'teal' }: { label: string; value: number | string; hint: string; tone?: 'teal' | 'blue' | 'gold' | 'violet' }) {
  return <article className={`metric-card metric-${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return <div className="table-wrap"><table>{children}</table></div>;
}
