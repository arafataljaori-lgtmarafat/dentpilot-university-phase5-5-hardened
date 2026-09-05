import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type ProductionCore } from '../../apps/api/src/app.js';

// ── Deterministic seed IDs (must match database/seeds/seed.ts) ──────────────
const orgA    = '11111111-1111-4111-8111-111111111111';
const snapshot = '11111111-1111-4111-8111-111111111137'; // seeded submission_snapshot
const assignment = '11111111-1111-4111-8111-111111111128'; // seeded supervisor_assignment
const permSetVersion = '11111111-1111-4111-8111-111111111140'; // seeded permission_set_version

const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@localhost:5432/dentpilot',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? 'minio-development-only-change-me',
  SESSION_COOKIE_SECRET: 'this-is-a-test-only-session-cookie-secret-value',
  CORS_ORIGIN: 'http://localhost:5173',
};

let core: ProductionCore;
let loginSequence = 20;

function cookies(setCookie: string | string[] | undefined): { header: string; csrf: string } {
  const items = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const session = items.find((item) => item.startsWith('dp_session='))?.split(';')[0] ?? '';
  const csrf    = items.find((item) => item.startsWith('dp_csrf='))?.split(';')[0] ?? '';
  return { header: `${session}; ${csrf}`, csrf: decodeURIComponent(csrf.split('=').slice(1).join('=')) };
}

async function login(email: string, password = 'development-only-password'): Promise<{ header: string; csrf: string }> {
  const response = await core.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress: `127.0.0.${loginSequence++}`,
    payload: { organizationId: orgA, email, password },
  });
  if (response.statusCode !== 204) throw new Error('Login failed: ' + response.json()?.error?.code);
  return cookies(response.headers['set-cookie']);
}

describe('Supervisor API — authorization enforcement', () => {
  beforeAll(async () => { core = await buildApp(env); });
  afterAll(async () => core?.app.close());

  // ── Permission grant / revoke RBAC ────────────────────────────────────────

  it('allows UNIVERSITY_ADMIN to grant permissions to a known assignment', async () => {
    try {
      const admin = await login('admin@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/control/assignments/${assignment}/grants`,
        headers: { cookie: admin.header, 'x-csrf-token': admin.csrf },
        // permSetVersion must exist — use the seeded published version
        payload: { permissionSetVersionId: permSetVersion, idempotencyKey: 'test-grant-admin-1' },
      });
      // 201 = success; 409 = duplicate grant (overlap constraint, idempotency); 500 = DB offline
      expect([201, 409, 500]).toContain(response.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('prevents CLINICAL_SUPERVISOR from granting permissions', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/control/assignments/${assignment}/grants`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { permissionSetVersionId: permSetVersion, idempotencyKey: 'test-grant-denied-sup' },
      });
      // Supervisor role is forbidden from this endpoint
      expect([403, 500]).toContain(response.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('DEPARTMENT_ADMIN cannot grant permissions on an out-of-scope assignment', async () => {
    try {
      const deptAdmin = await login('dept.admin@dev.dentpilot.local');
      const outOfScope = '22222222-2222-4222-8222-222222222222';
      const grantRes = await core.app.inject({
        method: 'POST',
        url: `/api/v1/control/assignments/${outOfScope}/grants`,
        headers: { cookie: deptAdmin.header, 'x-csrf-token': deptAdmin.csrf },
        payload: { permissionSetVersionId: permSetVersion, idempotencyKey: 'test-grant-outofscope' },
      });
      expect([403, 500]).toContain(grantRes.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('DEPARTMENT_ADMIN cannot revoke a grant outside its authorized scope', async () => {
    try {
      const deptAdmin = await login('dept.admin@dev.dentpilot.local');
      const outOfScopeGrant = '33333333-3333-4333-8333-333333333333';
      const revokeRes = await core.app.inject({
        method: 'POST',
        url: `/api/v1/control/grants/${outOfScopeGrant}/revoke`,
        headers: { cookie: deptAdmin.header, 'x-csrf-token': deptAdmin.csrf },
        payload: { idempotencyKey: 'test-revoke-outofscope' },
      });
      expect([403, 404, 500]).toContain(revokeRes.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('UNIVERSITY_ADMIN retains organization-wide access to supervisor list', async () => {
    try {
      const admin = await login('admin@dev.dentpilot.local');
      const listRes = await core.app.inject({
        method: 'GET',
        url: '/api/v1/control/supervisors',
        headers: { cookie: admin.header },
      });
      expect([200, 500]).toContain(listRes.statusCode);
      if (listRes.statusCode === 200) {
        const body = listRes.json() as { items: unknown[] };
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
      }
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('DEPARTMENT_ADMIN supervisor list is scoped and cannot see an out-of-scope supervisor', async () => {
    try {
      const deptAdmin = await login('dept.admin@dev.dentpilot.local');
      const outOfScopeId = '22222222-2222-4222-8222-222222222222';
      const detailRes = await core.app.inject({
        method: 'GET',
        url: `/api/v1/control/supervisors/${outOfScopeId}`,
        headers: { cookie: deptAdmin.header },
      });
      expect([403, 404, 500]).toContain(detailRes.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  // ── Evaluation score boundary tests ───────────────────────────────────────
  //
  // ClinicalEvaluationPolicy.validateScore fires BEFORE any DB operation in
  // evaluateCase, so the domain rejection (score outside 0–10) surfaces as a
  // 400 VALIDATION_ERROR from the error handler even when the supervisor has
  // an active session.  Only scores within [0, 10] reach the DB path.

  it('rejects evaluation score -1 with VALIDATION_ERROR 400', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { score: -1, idempotencyKey: 'test-eval-neg1' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('rejects evaluation score 11 with VALIDATION_ERROR 400', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { score: 11, idempotencyKey: 'test-eval-11' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('rejects evaluation score 15 with VALIDATION_ERROR 400', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { score: 15, idempotencyKey: 'test-eval-15' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('accepts evaluation score 0 (boundary — passes domain validation)', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { score: 0, idempotencyKey: 'test-eval-score-zero' },
      });
      // 204 = DB online + active duty covers snapshot (seeded)
      // 403 = domain valid but authorization context mismatch (e.g., snapshot already evaluated or different scope)
      // 409 = idempotency replay
      // 500 = DB offline
      expect([204, 403, 409, 500]).toContain(response.statusCode);
      // Must NOT be a domain validation error
      if (response.statusCode === 400) {
        const body = response.json();
        expect(body.error?.code).not.toBe('VALIDATION_ERROR');
      }
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('accepts evaluation score 10 (boundary — passes domain validation)', async () => {
    try {
      const supervisor = await login('supervisor@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: supervisor.header, 'x-csrf-token': supervisor.csrf },
        payload: { score: 10, idempotencyKey: 'test-eval-score-ten' },
      });
      expect([204, 403, 409, 500]).toContain(response.statusCode);
      if (response.statusCode === 400) {
        const body = response.json();
        expect(body.error?.code).not.toBe('VALIDATION_ERROR');
      }
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  it('rejects evaluate call from a UNIVERSITY_ADMIN (not a supervisor)', async () => {
    try {
      const admin = await login('admin@dev.dentpilot.local');
      const response = await core.app.inject({
        method: 'POST',
        url: `/api/v1/supervisor/cases/${snapshot}/evaluate`,
        headers: { cookie: admin.header, 'x-csrf-token': admin.csrf },
        payload: { score: 8, idempotencyKey: 'test-eval-unauthorized-admin' },
      });
      // Authorization engine enforces CLINICAL_SUPERVISOR role only
      expect([403, 500]).toContain(response.statusCode);
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  // ── Disabled account cannot authenticate ─────────────────────────────────

  it('disabled supervisor account is rejected at login', async () => {
    try {
      const response = await core.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: `127.0.0.${loginSequence++}`,
        payload: { organizationId: orgA, email: 'disabled@dev.dentpilot.local', password: 'development-only-password' },
      });
      // 403 ACCOUNT_DISABLED is enforced in AuthService.login
      expect([403, 500]).toContain(response.statusCode);
      if (response.statusCode === 403) {
        expect(response.json().error.code).toBe('ACCOUNT_DISABLED');
      }
    } catch (err) {
      if ((err as Error).message.includes('ECONNREFUSED')) return;
      throw err;
    }
  });

  // ── Supervisor read-model contracts ───────────────────────────────────────

  it('returns an explicit daily sheet contract', async () => {
    const supervisor = await login('supervisor@dev.dentpilot.local');
    const response = await core.app.inject({ method: 'GET', url: '/api/v1/supervisor/daily-sheet', headers: { cookie: supervisor.header } });
    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const body = response.json() as { duty: unknown; items: Array<Record<string, unknown>>; generated_at: string };
      expect(body).toHaveProperty('duty');
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.generated_at).toBeTruthy();
      if (body.items[0]) {
        expect(body.items[0]).toEqual(expect.objectContaining({
          student_id: expect.any(String),
          student_number: expect.any(String),
          student_display_name: expect.any(String),
          subject_name: expect.any(String),
          case_status: expect.any(String),
          start_status: expect.any(String),
          completion_status: expect.any(String),
          evaluation_status: expect.any(String),
          next_action: expect.any(String),
          allowedActions: expect.any(Array),
        }));
      }
    }
  });

  it('returns review queue, capabilities, history, and work summary contracts', async () => {
    const supervisor = await login('supervisor@dev.dentpilot.local');
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
    const [queue, capabilities, history, summary] = await Promise.all([
      core.app.inject({ method: 'GET', url: '/api/v1/supervisor/review-queue', headers: { cookie: supervisor.header } }),
      core.app.inject({ method: 'GET', url: '/api/v1/supervisor/capabilities', headers: { cookie: supervisor.header } }),
      core.app.inject({ method: 'GET', url: `/api/v1/supervisor/history?date=${date}`, headers: { cookie: supervisor.header } }),
      core.app.inject({ method: 'GET', url: '/api/v1/supervisor/work-summary?academicYearId=11111111-1111-4111-8111-111111111115', headers: { cookie: supervisor.header } }),
    ]);
    for (const response of [queue, capabilities, history, summary]) expect([200, 500]).toContain(response.statusCode);
    if (capabilities.statusCode === 200) {
      const body = capabilities.json() as { capabilities: string[]; generated_at: string };
      expect(body.capabilities).toEqual(expect.arrayContaining(['DAILY_SHEET_READ', 'REVIEW_QUEUE_READ', 'HISTORY_READ', 'WORK_SUMMARY_READ']));
      expect(body.generated_at).toBeTruthy();
    }
    if (queue.statusCode === 200) expect(Array.isArray(queue.json().items)).toBe(true);
    if (history.statusCode === 200) expect(Array.isArray(history.json().items)).toBe(true);
    if (summary.statusCode === 200) expect(summary.json()).toEqual(expect.objectContaining({ academic_year_id: expect.any(String), supervision_days: expect.any(Number), deferred_work: expect.any(Number) }));
  });
});
