export const API_PREFIX = '/api/v1';

export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'CSRF_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'ACCOUNT_DISABLED'
  | 'INVITATION_INVALID'
  | 'IMMUTABLE_RECORD'
  | 'ILLEGAL_TRANSITION';

export type AccountRole = 'UNIVERSITY_ADMIN' | 'DEPARTMENT_ADMIN' | 'CLINICAL_SUPERVISOR' | 'STUDENT_INTEGRATION';
export type LifecycleStatus = 'ACTIVE' | 'CLOSED' | 'REMOVED' | 'ARCHIVED';
export type EnrollmentStatus = 'ACTIVE' | 'CLOSED';
export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUESTED' | 'APPROVED_START' | 'APPROVED_FINAL' | 'GRADED';

export interface ApiError {
  error: { code: ErrorCode; message: string; requestId: string; details?: Record<string, string[]> };
}

export interface SessionActorDto {
  accountId: string;
  organizationId: string;
  collegeId: string | null;
  role: AccountRole;
  departmentIds: string[];
}

export interface PageMetaDto { page: number; pageSize: number; total: number; totalPages: number; }

export interface DepartmentDto { id: string; collegeId: string; code: string; name: string; active: boolean; revision: number; }
export interface AcademicYearDto { id: string; label: string; startsOn: string; endsOn: string; status: LifecycleStatus; revision: number; }
export interface AcademicLevelDto { id: string; code: string; label: string; ordinal: number; active: boolean; }
export interface CohortDto { id: string; label: string; active: boolean; }
export interface GroupDto { id: string; departmentId: string; academicYearId: string; academicLevelId: string; name: string; rangeStart: number | null; rangeEnd: number | null; status: LifecycleStatus; revision: number; }

export interface EnrollmentSummaryDto {
  id: string; academicYearId: string; academicLevelId: string; cohortId: string; status: EnrollmentStatus;
  startedAt: string; closedAt: string | null; closeReason: string | null; revision: number;
}

export interface StudentListItemDto {
  id: string; studentNumber: string; displayName: string; status: LifecycleStatus; revision: number;
  activeEnrollment: EnrollmentSummaryDto | null; departmentIds: string[];
}
export interface StudentListDto { items: StudentListItemDto[]; page: PageMetaDto; }

export interface RosterMembershipDto { id: string; rosterId: string; departmentId: string; status: LifecycleStatus; addedAt: string; closedAt: string | null; reason: string | null; }
export interface GroupMembershipDto { id: string; groupId: string; departmentId: string; status: LifecycleStatus; assignedAt: string; removedAt: string | null; reason: string | null; }
export interface EnrollmentDetailDto extends EnrollmentSummaryDto { rosterMemberships: RosterMembershipDto[]; groupMemberships: GroupMembershipDto[]; }
export interface StudentDetailDto { id: string; collegeId: string; studentNumber: string; displayName: string; status: LifecycleStatus; revision: number; enrollments: EnrollmentDetailDto[]; }

export interface AssignmentPermissionsDto { reviewCases: boolean; grade: boolean; }
export interface SupervisorAssignmentDto {
  id: string; supervisorAccountId: string; supervisorDisplayName: string | null; departmentId: string;
  academicYearId: string; academicLevelId: string; cohortId: string | null; groupId: string | null;
  status: LifecycleStatus; effectiveFrom: string; effectiveTo: string | null; revision: number; reason: string;
  permissions: AssignmentPermissionsDto;
}
export interface SupervisorAssignmentListDto { items: SupervisorAssignmentDto[]; page: PageMetaDto; }

export interface SubmissionListItemDto {
  id: string; caseSheetId: string; studentId: string; studentNumber: string; studentDisplayName: string;
  departmentId: string; termId: string; academicYearId: string; academicLevelId: string; cohortId: string;
  groupId: string | null; supervisorAssignmentId: string | null; status: SubmissionStatus; sequence: number; submittedAt: string;
}
export interface SubmissionListDto { items: SubmissionListItemDto[]; page: PageMetaDto; }
export interface RevisionRequestDto { id: string; requestedByAccountId: string; reason: string; createdAt: string; }
export interface ClinicalDecisionDto { id: string; type: 'APPROVE_START' | 'APPROVE_FINAL' | 'REQUEST_REVISION'; decidedByAccountId: string; reason: string | null; createdAt: string; }
export interface GradeEventDto { id: string; action: 'RECORDED' | 'AMENDED'; previousGrade: number | null; newGrade: number; maxGrade: number; reason: string | null; comment: string; createdAt: string; }
export interface SupervisorNoteDto { id: string; authorAccountId: string; body: string; studentVisible: boolean; createdAt: string; }
export interface AttachmentDto { id: string; fileId: string; contentType: string; byteSize: number; sha256: string; createdAt: string; }
export interface SubmissionDetailDto extends SubmissionListItemDto {
  enrollmentId: string; workflowPolicyVersionId: string; requirementSetVersionId: string; requirementId: string | null;
  templateVersionId: string; gradingPolicyVersionId: string | null; payload: Record<string, unknown>;
  revisions: RevisionRequestDto[]; decisions: ClinicalDecisionDto[]; grades: GradeEventDto[];
  supervisorNotes: SupervisorNoteDto[]; attachments: AttachmentDto[];
}

export interface AggregateReportDto { organizationId: string; academicYearId: string; totalStudents: number; totalSubmittedCases: number; pendingClinicalDecisions: number; generatedAt: string; }
export interface DashboardReportDto extends AggregateReportDto { departmentId: string | null; gradedCases: number; activeSupervisors: number; }
export interface DepartmentReportRowDto { departmentId: string; departmentCode: string; departmentName: string; studentCount: number; submittedCases: number; pendingClinicalDecisions: number; gradedCases: number; averageGrade: number | null; }
export interface ScopedReportDto { organizationId: string; academicYearId: string; departmentId: string | null; rows: DepartmentReportRowDto[]; generatedAt: string; }

export interface InvitationCreatedDto { invitationToken?: string; }
export interface PresignUploadDto { fileId: string; uploadUrl: string; expiresInSeconds: number; requiredHeaders: Record<string, string>; }
export interface PresignReadDto { readUrl: string; expiresInSeconds: number; }
export interface FileCompletionDto { fileId: string; status: 'UPLOADED' | 'LINKED'; completedAt: string; }
export interface AttachmentLinkDto { attachmentId: string; fileId: string; draftId: string; }

export interface StudentSubmissionDto { snapshotId: string; status: SubmissionStatus; submittedAt: string; studentVisibleFeedback?: string; }
export interface StudentSubmissionListDto { items: StudentSubmissionDto[]; page: PageMetaDto; }
export interface StudentDecisionDto { type: 'APPROVE_START' | 'APPROVE_FINAL' | 'REQUEST_REVISION'; reason: string | null; createdAt: string; }
export interface StudentFeedbackNoteDto { id: string; body: string; createdAt: string; }
export interface StudentGradeDto { grade: number; maxGrade: number; comment: string; createdAt: string; }
export interface StudentSubmissionDetailDto {
  snapshotId: string; caseSheetId: string; status: SubmissionStatus; sequence: number; submittedAt: string;
  payload: Record<string, unknown>; decisions: StudentDecisionDto[]; feedback: StudentFeedbackNoteDto[];
  grade: StudentGradeDto | null; attachments: AttachmentDto[];
}
export interface CreateDraftInput { templateVersionId: string; enrollmentId: string; payload: Record<string, unknown>; }
export interface StudentDraftDto {
  id: string; enrollmentId: string; termId: string; templateVersionId: string;
  payload: Record<string, unknown>; revision: number; createdAt: string; updatedAt: string;
}
export interface StudentDraftListDto { items: StudentDraftDto[]; }
export interface UpdateDraftInput { payload: Record<string, unknown>; expectedRevision: number; idempotencyKey: string; }
export interface SubmitCaseInput { idempotencyKey: string; draftId: string; }
export interface GradeCaseInput { grade: number; comment: string; idempotencyKey: string; }
export interface AmendGradeInput extends GradeCaseInput { reason: string; }
export interface ReopenTermResultInput { reason: string; idempotencyKey: string; }

export type SupervisorAction = 'START_APPROVAL' | 'COMPLETION_APPROVAL' | 'CASESHEET_EVALUATION' | 'CLINICAL_FEEDBACK';

export interface SupervisorSummaryDto {
  id: string;
  active: boolean;
  display_name: string;
  email: string;
}
export interface SupervisorListDto { items: SupervisorSummaryDto[]; }

export interface SupervisorGrantDto {
  id: string;
  permission_set_version_id: string;
  granted_at: string;
  revoked_at: string | null;
  assignment_id: string;
  department_id: string | null;
}
export interface SupervisorGrantListDto { items: SupervisorGrantDto[]; }

export interface IdResponseDto { id: string; }
export interface DutyScheduleDto {
  id: string;
  department_id: string;
  academic_year_id: string;
  timezone: string;
  valid_from: string;
  valid_to: string;
}
export interface DutyScheduleListDto { items: DutyScheduleDto[]; }
export interface DutyShiftMemberDto {
  member_id: string;
  assignment_id: string;
  supervisor_name: string | null;
}
export interface DutyShiftDto {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LifecycleStatus;
  members: DutyShiftMemberDto[] | null;
}
export interface DutyScheduleDetailDto extends DutyScheduleDto { shifts: DutyShiftDto[]; }

export interface SupervisorDutyDto {
  id: string;
  starts_at: string;
  ends_at: string;
  assignment_id: string;
}
export interface SupervisorDutyCaseDto {
  snapshot_id: string;
  current_status: SubmissionStatus;
}
export interface SupervisorCaseDetailDto {
  snapshot_id: string;
  current_status: SubmissionStatus;
  payload: Record<string, unknown>;
  allowedActions: SupervisorAction[];
}
