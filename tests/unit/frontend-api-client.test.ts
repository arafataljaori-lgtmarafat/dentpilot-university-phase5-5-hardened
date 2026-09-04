import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, setUnauthorizedHandler } from '../../apps/web/src/api/client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function problemResponse(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: `problem-${code}`, requestId: 'request-test' } }, status);
}

const workflowCases: Array<{
  name: string;
  path: string;
  mutation: boolean;
  run: () => Promise<unknown>;
}> = [
  { name: 'Login', path: '/api/v1/auth/login', mutation: true, run: () => api.login({ organizationId: 'organization-id', email: 'user@example.test', password: 'long-enough-password' }) },
  { name: 'Dashboard', path: '/api/v1/reports/dashboard', mutation: false, run: () => api.dashboard('academic-year-id') },
  { name: 'Student management', path: '/api/v1/students', mutation: false, run: () => api.students({}) },
  { name: 'Supervisor workflows', path: '/api/v1/supervisor-assignments', mutation: false, run: () => api.assignments({}) },
  { name: 'Submission workflow', path: '/api/v1/staff/submissions', mutation: false, run: () => api.submissions({}) },
  { name: 'Review workflow', path: '/api/v1/staff/submissions/submission-id/revision-requests', mutation: true, run: () => api.requestRevision('submission-id', 'سبب واضح', 'idempotency-id') },
  { name: 'Decision workflow', path: '/api/v1/staff/submissions/submission-id/approve-start', mutation: true, run: () => api.approveStart('submission-id', 'idempotency-id') },
  { name: 'Grading workflow', path: '/api/v1/staff/submissions/submission-id/grades', mutation: true, run: () => api.grade('submission-id', { grade: 90, comment: 'مكتمل', idempotencyKey: 'idempotency-id' }) },
  { name: 'Reports', path: '/api/v1/reports/scoped', mutation: false, run: () => api.scopedReport('academic-year-id') },
];

describe('Phase 2C frontend API workflow adapter', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: 'dp_csrf=csrf%20token' });
  });

  afterEach(() => {
    setUnauthorizedHandler(undefined);
    vi.unstubAllGlobals();
  });

  it.each(workflowCases)('$name sends a successful request through the production client', async ({ path, mutation, run }) => {
    fetchMock.mockResolvedValue(mutation ? new Response(null, { status: 204 }) : jsonResponse({}));

    const result = await run();
    if (mutation) expect(result).toBeUndefined();
    else expect(result).toBeDefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(path);
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    const headers = new Headers(init?.headers);
    expect(headers.get('accept')).toBe('application/json');
    if (mutation) expect(headers.get('x-csrf-token')).toBe('csrf token');
  });

  it.each(workflowCases)('$name exposes an unauthorized response without optimistic success', async ({ name, run }) => {
    const status = name === 'Login' ? 401 : 403;
    const code = status === 401 ? 'AUTHENTICATION_REQUIRED' : 'FORBIDDEN';
    fetchMock.mockResolvedValue(problemResponse(status, code));

    await expect(run()).rejects.toMatchObject({ status, code, requestId: 'request-test' });
  });

  it.each(workflowCases)('$name exposes a server failure to the UI', async ({ run }) => {
    fetchMock.mockResolvedValue(problemResponse(500, 'INTERNAL_ERROR'));
    await expect(run()).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('invalidates the in-memory session when the API returns 401', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    fetchMock.mockResolvedValue(problemResponse(401, 'AUTHENTICATION_REQUIRED'));

    await expect(api.session()).rejects.toBeInstanceOf(ApiClientError);
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('normalizes network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    await expect(api.session()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('rejects a successful response that violates the JSON contract', async () => {
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }));
    await expect(api.session()).rejects.toMatchObject({ status: 200, code: 'INVALID_RESPONSE' });
  });
});
