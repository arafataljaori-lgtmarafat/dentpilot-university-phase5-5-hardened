import { useState, type FormEvent } from 'react';
import { ApiClientError } from '../../api/client';
import { useSession } from '../../auth/session';

export function LoginPage() {
  const session = useSession();
  const [organizationId, setOrganizationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await session.login({ organizationId: organizationId.trim(), email: email.trim(), password });
    } catch (reason) {
      setError(reason instanceof ApiClientError ? reason.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page">
    <section className="login-visual">
      <div className="brand-lockup"><span className="brand-mark">DP</span><span><b>DentPilot</b><small>University Portal</small></span></div>
      <div className="login-message"><span className="eyebrow">PRODUCTION ACADEMIC CORE</span><h1>العمل الأكاديمي والسريري في مساحة مؤسسية واحدة.</h1><p>تُستعاد الجلسة والصلاحيات والنطاق من الخادم. لا توجد حسابات عرض أو بيانات تجريبية داخل الواجهة.</p></div>
      <div className="security-note"><span>✓</span><div><b>Server-authoritative access</b><small>PostgreSQL · RLS · Audit trail</small></div></div>
    </section>
    <section className="login-panel">
      <form className="login-form" onSubmit={submit}>
        <div><span className="eyebrow">SECURE SIGN IN</span><h2>تسجيل الدخول</h2><p>أدخل معرّف المؤسسة وبيانات حسابك المعتمدة.</p></div>
        <label className="field"><span>معرّف المؤسسة</span><input required inputMode="text" autoComplete="organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="Organization UUID" /></label>
        <label className="field"><span>البريد الإلكتروني</span><input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" /></label>
        <label className="field"><span>كلمة المرور</span><input required minLength={12} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <button className="button primary login-button" disabled={busy}>{busy ? 'جارٍ التحقق…' : 'دخول آمن'}</button>
      </form>
    </section>
  </main>;
}
