import { useMemo, useState, type FormEvent } from 'react';
import type { SubmissionStatus } from '@dentpilot/contracts';
import { api, ApiClientError, newIdempotencyKey, type SubmissionListQuery } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, Pager, StatusBadge } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

const statuses: SubmissionStatus[] = ['SUBMITTED', 'REVISION_REQUESTED', 'APPROVED_START', 'APPROVED_FINAL', 'GRADED'];

export function SubmissionsPage({ reviewQueue = false }: { reviewQueue?: boolean }) {
  const catalogs = useResource(() => Promise.all([api.departments(), api.academicYears(), api.academicLevels(), api.cohorts()]), []);
  const [filters, setFilters] = useState<SubmissionListQuery>({ page: 1, pageSize: 25, ...(reviewQueue ? { status: 'SUBMITTED' as const } : {}) });
  const resource = useResource(() => api.submissions(filters), [filters]);

  return <>
    <PageHeader eyebrow={reviewQueue ? 'CLINICAL REVIEW QUEUE' : 'SUBMISSION REGISTER'} title={reviewQueue ? 'طابور المراجعة' : 'التسليمات السريرية'} description={reviewQueue ? 'حالات مرسلة يحدد الخادم إمكانية مراجعتها والانتقال بينها.' : 'السجل الخادمي للحالات المرسلة ضمن نطاق الحساب.'} />
    <section className="surface filter-panel"><div className="filter-row"><Field label="القسم"><select value={filters.departmentId ?? ''} onChange={(event) => setFilters({ ...filters, departmentId: event.target.value || undefined, page: 1 })}><option value="">كل الأقسام</option>{catalogs.data?.[0].map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="السنة"><select value={filters.academicYearId ?? ''} onChange={(event) => setFilters({ ...filters, academicYearId: event.target.value || undefined, page: 1 })}><option value="">كل السنوات</option>{catalogs.data?.[1].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="المستوى"><select value={filters.academicLevelId ?? ''} onChange={(event) => setFilters({ ...filters, academicLevelId: event.target.value || undefined, page: 1 })}><option value="">كل المستويات</option>{catalogs.data?.[2].map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="الحالة"><select value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as SubmissionStatus | undefined, page: 1 })}><option value="">كل الحالات</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field></div></section>
    {catalogs.loading || resource.loading ? <LoadingState /> : catalogs.error ? <ErrorState error={catalogs.error} onRetry={catalogs.reload} /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data?.items.length ? <EmptyState title="لا توجد حالات" description="لا توجد تسليمات مطابقة ضمن النطاق والفلاتر الحالية." /> : <section className="surface"><DataTable><thead><tr><th>Case Sheet</th><th>الطالب</th><th>القسم</th><th>التاريخ</th><th>الحالة</th><th /></tr></thead><tbody>{resource.data.items.map((submission) => <tr key={submission.id}><td><b>{submission.caseSheetId}</b><small className="block">Sequence {submission.sequence}</small></td><td><b>{submission.studentDisplayName}</b><small className="block mono">{submission.studentNumber}</small></td><td>{catalogs.data?.[0].find((item) => item.id === submission.departmentId)?.name ?? submission.departmentId}</td><td>{new Date(submission.submittedAt).toLocaleString('ar')}</td><td><StatusBadge value={submission.status} /></td><td><button className="button ghost" onClick={() => navigate(`/submissions/${submission.id}`)}>فتح الحالة</button></td></tr>)}</tbody></DataTable><Pager {...resource.data.page} onPage={(page) => setFilters({ ...filters, page })} /></section>}
  </>;
}

interface ActionPanelProps { id: string; currentGrade: number | undefined; onComplete: () => void; }

function ClinicalActions({ id, currentGrade, onComplete }: ActionPanelProps) {
  const [reason, setReason] = useState('');
  const [grade, setGrade] = useState(currentGrade?.toString() ?? '');
  const [comment, setComment] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState<string>();

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name); setError(undefined); setMessage(undefined);
    try { await action(); setMessage('تم قبول الإجراء من الخادم.'); onComplete(); }
    catch (failure) { setError(failure); }
    finally { setBusy(undefined); }
  };

  const submitRevision = (event: FormEvent) => { event.preventDefault(); void run('revision', () => api.requestRevision(id, reason, newIdempotencyKey())); };
  const submitGrade = (event: FormEvent) => { event.preventDefault(); void run('grade', () => api.grade(id, { grade: Number(grade), comment, ...(amendmentReason ? { reason: amendmentReason } : {}), idempotencyKey: newIdempotencyKey() })); };

  return <section className="action-stack">
    <div className="surface action-card"><span className="eyebrow">CLINICAL DECISION</span><h2>قرار المراجعة</h2><p>الأزرار ترسل الطلب فقط؛ الـBackend يتحقق من التكليف والصلاحية والحالة.</p><div className="action-buttons"><button disabled={Boolean(busy)} className="button primary" onClick={() => void run('start', () => api.approveStart(id, newIdempotencyKey()))}>اعتماد البدء</button><button disabled={Boolean(busy)} className="button primary" onClick={() => void run('final', () => api.approveFinal(id, newIdempotencyKey()))}>اعتماد نهائي</button></div><form onSubmit={submitRevision}><Field label="سبب طلب التعديل"><textarea required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><button disabled={Boolean(busy)} className="button secondary">طلب تعديل</button></form></div>
    <form className="surface action-card" onSubmit={submitGrade}><span className="eyebrow">ACADEMIC GRADING</span><h2>{currentGrade === undefined ? 'تسجيل الدرجة' : 'تعديل الدرجة'}</h2><Field label="الدرجة"><input required type="number" min="0" max="100" step="0.01" value={grade} onChange={(event) => setGrade(event.target.value)} /></Field><Field label="التعليق"><textarea required minLength={1} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>{currentGrade !== undefined ? <Field label="سبب التعديل"><textarea required maxLength={1000} value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} /></Field> : null}<button disabled={Boolean(busy)} className="button primary">إرسال التقييم</button></form>
    {message ? <div className="inline-success" role="status">{message}</div> : null}
    {error ? <ErrorState error={error} /> : null}
  </section>;
}

export function SubmissionDetailPage({ id }: { id: string }) {
  const resource = useResource(() => api.submission(id), [id]);
  const assignments = useResource(() => api.assignments({ page: 1, pageSize: 100 }), []);
  const [readLinks, setReadLinks] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<unknown>();
  const presentationPermissions = useMemo(() => assignments.data?.items.find((item) => item.id === resource.data?.supervisorAssignmentId)?.permissions, [assignments.data, resource.data?.supervisorAssignmentId]);
  const canReview = Boolean(presentationPermissions?.reviewCases);
  const canGrade = Boolean(presentationPermissions?.grade);
  const latestGrade = resource.data?.grades.at(-1)?.newGrade;

  const createReadLink = async (fileId: string) => {
    setFileError(undefined);
    try {
      const result = await api.presignRead(fileId);
      const readUrl = new URL(result.readUrl, window.location.origin);
      if (!['http:', 'https:'].includes(readUrl.protocol)) throw new ApiClientError(200, 'INVALID_RESPONSE', 'أعاد الخادم رابط ملف ببروتوكول غير مسموح.');
      setReadLinks((current) => ({ ...current, [fileId]: readUrl.href }));
    }
    catch (error) { setFileError(error); }
  };

  return <>
    <button className="back-link" onClick={() => navigate('/submissions')}>← العودة إلى التسليمات</button>
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : !resource.data ? null : <>
      <PageHeader eyebrow="CASE SHEET DETAIL" title={resource.data.caseSheetId} description={`${resource.data.studentDisplayName} · ${resource.data.studentNumber}`} actions={<StatusBadge value={resource.data.status} />} />
      <section className="detail-layout"><div className="detail-main">
        <section className="surface profile-summary"><dl><div><dt>Submission ID</dt><dd className="mono">{resource.data.id}</dd></div><div><dt>Sequence</dt><dd>{resource.data.sequence}</dd></div><div><dt>Submitted</dt><dd>{new Date(resource.data.submittedAt).toLocaleString('ar')}</dd></div><div><dt>Assignment</dt><dd className="mono">{resource.data.supervisorAssignmentId ?? '—'}</dd></div></dl></section>
        <section className="surface"><span className="eyebrow">IMMUTABLE SNAPSHOT</span><h2>بيانات النموذج</h2><div className="payload-grid">{Object.entries(resource.data.payload).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd></div>)}</div></section>
        <section className="surface"><span className="eyebrow">WORKFLOW HISTORY</span><h2>التاريخ السريري والأكاديمي</h2>{!resource.data.revisions.length && !resource.data.decisions.length && !resource.data.grades.length ? <EmptyState title="لا يوجد تاريخ" description="لم تُسجل أحداث قرار أو تقييم لهذه النسخة." /> : <div className="timeline">{[...resource.data.decisions.map((item) => ({ id: item.id, at: item.createdAt, title: item.type, detail: item.reason })), ...resource.data.revisions.map((item) => ({ id: item.id, at: item.createdAt, title: 'REVISION REQUEST', detail: item.reason })), ...resource.data.grades.map((item) => ({ id: item.id, at: item.createdAt, title: `${item.action} · ${item.newGrade}/${item.maxGrade}`, detail: item.comment }))].sort((a, b) => a.at.localeCompare(b.at)).map((item) => <article key={item.id}><span className="timeline-dot" /><div><header><b>{item.title}</b><small>{new Date(item.at).toLocaleString('ar')}</small></header>{item.detail ? <p>{item.detail}</p> : null}</div></article>)}</div>}</section>
        <section className="surface"><span className="eyebrow">PRIVATE ATTACHMENTS</span><h2>المرفقات</h2>{resource.data.attachments.length ? <div className="attachment-list">{resource.data.attachments.map((attachment) => <article key={attachment.id}><div><b>{attachment.contentType}</b><small>{Math.ceil(attachment.byteSize / 1024)} KB · SHA-256 {attachment.sha256.slice(0, 12)}…</small></div>{readLinks[attachment.fileId] ? <a className="button secondary" href={readLinks[attachment.fileId]} target="_blank" rel="noreferrer">فتح الرابط المؤقت</a> : <button className="button ghost" onClick={() => void createReadLink(attachment.fileId)}>طلب رابط قراءة</button>}</article>)}</div> : <EmptyState title="لا توجد مرفقات" description="لا توجد ملفات مرتبطة بهذه النسخة." />}{fileError ? <ErrorState error={fileError} /> : null}</section>
      </div><aside>{canReview || canGrade ? <ClinicalActions id={id} currentGrade={latestGrade} onComplete={resource.reload} /> : <div className="state-card permission-note"><h2>عرض فقط</h2><p>لا يعرض هذا الحساب أدوات القرار أو التقييم. أي طلب مباشر يظل خاضعًا لسلطة الـBackend.</p>{assignments.error instanceof ApiClientError ? <small>{assignments.error.message}</small> : null}</div>}</aside></section>
    </>}
  </>;
}
