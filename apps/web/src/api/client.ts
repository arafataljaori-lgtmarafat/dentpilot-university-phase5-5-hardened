import type {
  AccountRole,
  AcademicLevelDto,
  AcademicYearDto,
  ApiError,
  CohortDto,
  DashboardReportDto,
  DepartmentDto,
  DutyScheduleDetailDto,
  DutyScheduleListDto,
  GroupDto,
  IdResponseDto,
  InvitationCreatedDto,
  PresignReadDto,
  ScopedReportDto,
  SessionActorDto,
  StudentDetailDto,
  StudentListDto,
  SubmissionDetailDto,
  SubmissionListDto,
  SupervisorAssignmentListDto,
  SupervisorCaseDetailDto,
  SupervisorDutyCaseDto,
  SupervisorDutyDto,
  SupervisorGrantListDto,
  SupervisorListDto,
  SupervisorSummaryDto,
  SupervisorCapabilitiesDto,
  SupervisorDailySheetDto,
  SupervisorHistoryDayDto,
  SupervisorReviewQueueDto,
  SupervisorWorkSummaryDto,
  SubmissionStatus,
} from '@dentpilot/contracts';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const REQUEST_TIMEOUT_MS = 20_000;
let onUnauthorized: (() => void) | undefined;

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('dp_csrf='));
  return cookie ? decodeURIComponent(cookie.slice('dp_csrf='.length)) : undefined;
}

function queryString(values: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values as Record<string, string | number | undefined>)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())) {
    const token = csrfToken();
    if (token) headers.set('x-csrf-token', token);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new ApiClientError(0, 'REQUEST_TIMEOUT', 'انتهت مهلة الاتصال بالخادم. أعد المحاولة.');
    }
    if (init.signal?.aborted) throw error;
    throw new ApiClientError(0, 'NETWORK_ERROR', 'تعذر الاتصال بالخادم. تحقق من تشغيل الـAPI ثم أعد المحاولة.');
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }

  if (response.status === 401) onUnauthorized?.();
  if (!response.ok) {
    let problem: ApiError | undefined;
    try {
      problem = (await response.json()) as ApiError;
    } catch {
      problem = undefined;
    }
    throw new ApiClientError(
      response.status,
      problem?.error.code ?? 'HTTP_ERROR',
      problem?.error.message ?? `Request failed with status ${response.status}.`,
      problem?.error.requestId,
      problem?.error.details,
    );
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiClientError(response.status, 'INVALID_RESPONSE', 'أعاد الخادم استجابة غير صالحة للعقد المتفق عليه.');
  }
}

export interface StudentListQuery {
  departmentId?: string;
  academicYearId?: string;
  academicLevelId?: string;
  cohortId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface AssignmentListQuery {
  departmentId?: string;
  academicYearId?: string;
  academicLevelId?: string;
  status?: 'ACTIVE' | 'CLOSED' | 'REMOVED' | 'ARCHIVED';
  page?: number;
  pageSize?: number;
}

export interface SubmissionListQuery {
  departmentId?: string;
  academicYearId?: string;
  academicLevelId?: string;
  cohortId?: string;
  groupId?: string;
  status?: SubmissionStatus;
  page?: number;
  pageSize?: number;
}

export const api = {
  login: (input: { organizationId: string; email: string; password: string }) =>
    request<void>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  session: () => request<SessionActorDto>('/api/v1/session'),

  departments: () => request<DepartmentDto[]>('/api/v1/catalog/departments'),
  academicYears: () => request<AcademicYearDto[]>('/api/v1/catalog/academic-years'),
  academicLevels: () => request<AcademicLevelDto[]>('/api/v1/catalog/academic-levels'),
  cohorts: () => request<CohortDto[]>('/api/v1/catalog/cohorts'),
  groups: (filters: { departmentId?: string; academicYearId?: string; academicLevelId?: string }) =>
    request<GroupDto[]>(`/api/v1/groups${queryString(filters)}`),

  students: (filters: StudentListQuery) =>
    request<StudentListDto>(`/api/v1/students${queryString(filters)}`),
  student: (id: string) => request<StudentDetailDto>(`/api/v1/students/${encodeURIComponent(id)}`),

  assignments: (filters: AssignmentListQuery) =>
    request<SupervisorAssignmentListDto>(`/api/v1/supervisor-assignments${queryString(filters)}`),

  // Control APIs
  controlSupervisors: () => request<SupervisorListDto>('/api/v1/control/supervisors'),
  controlSupervisorDetail: (id: string) => request<SupervisorSummaryDto>(`/api/v1/control/supervisors/${encodeURIComponent(id)}`),
  controlSupervisorGrants: (id: string) => request<SupervisorGrantListDto>(`/api/v1/control/supervisors/${encodeURIComponent(id)}/grants`),
  controlSetSupervisorStatus: (id: string, active: boolean, idempotencyKey: string) =>
    request<void>(`/api/v1/control/supervisors/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ active, idempotencyKey }),
    }),
  controlGrantPermission: (assignmentId: string, permissionSetVersionId: string, idempotencyKey: string) =>
    request<IdResponseDto>(`/api/v1/control/assignments/${encodeURIComponent(assignmentId)}/grants`, {
      method: 'POST',
      body: JSON.stringify({ permissionSetVersionId, idempotencyKey }),
    }),
  controlRevokePermission: (grantId: string, idempotencyKey: string) =>
    request<void>(`/api/v1/control/grants/${encodeURIComponent(grantId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  controlIssueInvitation: (email: string, role: AccountRole, studentId?: string) =>
    request<InvitationCreatedDto>('/api/v1/invitations', {
      method: 'POST',
      body: JSON.stringify({ email, role, studentId }),
    }),
  controlReissueInvitation: (id: string, idempotencyKey: string) =>
    request<InvitationCreatedDto>(`/api/v1/control/invitations/${encodeURIComponent(id)}/reissue`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  controlRevokeInvitation: (id: string, idempotencyKey: string) =>
    request<void>(`/api/v1/control/invitations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  controlSchedules: () => request<DutyScheduleListDto>('/api/v1/control/schedules'),
  controlScheduleDetail: (id: string) => request<DutyScheduleDetailDto>(`/api/v1/control/schedules/${encodeURIComponent(id)}`),
  controlCreateSchedule: (input: { departmentId: string, academicYearId: string, timezone: string, validFrom: string, validTo: string, idempotencyKey: string }) =>
    request<IdResponseDto>('/api/v1/control/schedules', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  controlCreateShift: (id: string, input: { startsAt: string, endsAt: string, idempotencyKey: string }) =>
    request<IdResponseDto>(`/api/v1/control/schedules/${encodeURIComponent(id)}/shifts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  controlAddShiftMember: (id: string, input: { assignmentId: string, grantId: string, idempotencyKey: string }) =>
    request<void>(`/api/v1/control/shifts/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Supervisor APIs

  supervisorActiveDuty: () => request<SupervisorDutyDto[]>('/api/v1/supervisor/duties/current'),
  supervisorUpcomingDuties: () => request<SupervisorDutyDto[]>('/api/v1/supervisor/duties/upcoming'),
  supervisorDutyCases: () => request<SupervisorDutyCaseDto[]>('/api/v1/supervisor/cases'),
  supervisorDailySheet: () => request<SupervisorDailySheetDto>('/api/v1/supervisor/daily-sheet'),
  supervisorReviewQueue: () => request<SupervisorReviewQueueDto>('/api/v1/supervisor/review-queue'),
  supervisorHistoryDay: (date: string) => request<SupervisorHistoryDayDto>(`/api/v1/supervisor/history${queryString({ date })}`),
  supervisorWorkSummary: (academicYearId: string, termId?: string) => request<SupervisorWorkSummaryDto>(`/api/v1/supervisor/work-summary${queryString({ academicYearId, termId })}`),
  supervisorCapabilities: () => request<SupervisorCapabilitiesDto>('/api/v1/supervisor/capabilities'),
  supervisorCaseDetail: (id: string) => request<SupervisorCaseDetailDto>(`/api/v1/supervisor/cases/${encodeURIComponent(id)}`),

  submissions: (filters: SubmissionListQuery) =>
    request<SubmissionListDto>(`/api/v1/staff/submissions${queryString(filters)}`),
  submission: (id: string) => request<SubmissionDetailDto>(`/api/v1/staff/submissions/${encodeURIComponent(id)}`),
  requestRevision: (id: string, reason: string, idempotencyKey: string) =>
    request<void>(`/api/v1/staff/submissions/${encodeURIComponent(id)}/revision-requests`, {
      method: 'POST',
      body: JSON.stringify({ reason, idempotencyKey }),
    }),
  approveStart: (id: string, idempotencyKey: string) =>
    request<void>(`/api/v1/staff/submissions/${encodeURIComponent(id)}/approve-start`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  approveFinal: (id: string, idempotencyKey: string) =>
    request<void>(`/api/v1/staff/submissions/${encodeURIComponent(id)}/approve-final`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  grade: (id: string, input: { grade: number; comment: string; reason?: string; idempotencyKey: string }) =>
    request<void>(`/api/v1/staff/submissions/${encodeURIComponent(id)}/grades`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  supervisorApproveStart: (id: string, idempotencyKey: string) =>
    request<void>(`/api/v1/supervisor/cases/${encodeURIComponent(id)}/start-approval`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  supervisorApproveCompletion: (id: string, idempotencyKey: string) =>
    request<void>(`/api/v1/supervisor/cases/${encodeURIComponent(id)}/completion-approval`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    }),
  supervisorEvaluate: (id: string, score: number, idempotencyKey: string) =>
    request<void>(`/api/v1/supervisor/cases/${encodeURIComponent(id)}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ score, idempotencyKey }),
    }),
  supervisorFeedback: (id: string, body: string, studentVisible: boolean, idempotencyKey: string) =>
    request<void>(`/api/v1/supervisor/cases/${encodeURIComponent(id)}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ body, studentVisible, idempotencyKey }),
    }),

  dashboard: (academicYearId: string, departmentId?: string) =>
    request<DashboardReportDto>(`/api/v1/reports/dashboard${queryString({ academicYearId, departmentId })}`),
  scopedReport: (academicYearId: string, departmentId?: string) =>
    request<ScopedReportDto>(`/api/v1/reports/scoped${queryString({ academicYearId, departmentId })}`),
  presignRead: (fileId: string) => request<PresignReadDto>(`/api/v1/files/${encodeURIComponent(fileId)}/presign-read`),
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
