import type { PoolClient } from 'pg';
import type { StudentDraftDto, StudentDraftListDto } from '@dentpilot/contracts';
import { assertOptimisticLock } from '@dentpilot/domain';
import type { Principal } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';
import { ApiProblem } from '../../security/errors.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';

interface DraftRow {
  id: string;
  student_id: string;
  enrollment_id: string;
  term_id: string;
  template_version_id: string;
  payload: Record<string, unknown>;
  revision: number;
  created_at: Date;
  updated_at: Date;
}

const DRAFT_COLUMNS = 'id,student_id,enrollment_id,term_id,template_version_id,payload,revision,created_at,updated_at';

function toDto(row: DraftRow): StudentDraftDto {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    termId: row.term_id,
    templateVersionId: row.template_version_id,
    payload: row.payload,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// Ownership of student_drafts is exclusive to the STUDENT_INTEGRATION principal that
// owns it: every method rejects any other role up front (matching the existing hard
// check in CasesService.submitDraft / FilesService.linkToDraft), then re-asserts the
// dedicated 'student-drafts:manage' permission granted only to STUDENT_INTEGRATION,
// then filters every query by principal.studentId. Once a draft is submitted,
// CasesService.submitDraft deletes its student_drafts row in the same transaction
// that creates the immutable snapshot (see cases/service.ts), so a submitted draft
// simply no longer exists here — read/update calls for it correctly fall through to
// NOT_FOUND without any extra status flag to maintain.
export class StudentDraftsService {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly idempotency: IdempotencyService) {}

  async create(client: PoolClient, principal: Principal, input: { enrollmentId: string; templateVersionId: string; payload: Record<string, unknown>; idempotencyKey: string; correlationId: string }): Promise<StudentDraftDto> {
    if (principal.role !== 'STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403, 'FORBIDDEN', 'Only a student integration principal can create a draft.');
    await this.authorization.assert(client, principal, 'student-drafts:manage', { studentId: principal.studentId });
    const result = await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'draft.create',
      request: { enrollmentId: input.enrollmentId, templateVersionId: input.templateVersionId, payload: input.payload },
      responseStatus: 201,
      execute: async () => {
        const enrollment = await client.query<{ academic_year_id: string; student_id: string; status: string }>(
          'SELECT academic_year_id,student_id,status FROM academic_enrollments WHERE id=$1',
          [input.enrollmentId],
        );
        if (!enrollment.rowCount || enrollment.rows[0].student_id !== principal.studentId || enrollment.rows[0].status !== 'ACTIVE') {
          throw new ApiProblem(404, 'NOT_FOUND', 'Enrollment not found.');
        }
        const template = await client.query('SELECT 1 FROM case_sheet_template_versions WHERE id=$1 AND status=\'PUBLISHED\'', [input.templateVersionId]);
        if (!template.rowCount) throw new ApiProblem(409, 'ILLEGAL_TRANSITION', 'Template is not published.');
        // The active term is resolved server-side from the enrollment's academic year
        // rather than accepted from the client, matching the shape of the pre-existing
        // CreateDraftInput contract (templateVersionId, enrollmentId, payload only — no
        // termId). Prefer a term whose date range covers today; fall back to the most
        // recently started active term otherwise, the same "prefer the specific match,
        // order, take one" idiom submitDraft already uses to resolve a supervisor assignment.
        const term = await client.query<{ id: string }>(
          `SELECT id FROM terms WHERE academic_year_id=$1 AND status='ACTIVE'
           ORDER BY (now()::date BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`,
          [enrollment.rows[0].academic_year_id],
        );
        if (!term.rowCount) throw new ApiProblem(409, 'ILLEGAL_TRANSITION', 'No active term exists for the enrollment academic year.');
        const draft = await client.query<DraftRow>(
          `INSERT INTO student_drafts(organization_id,student_id,enrollment_id,term_id,template_version_id,payload) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${DRAFT_COLUMNS}`,
          [principal.organizationId, principal.studentId, input.enrollmentId, term.rows[0].id, input.templateVersionId, input.payload],
        );
        await this.audit.append(client, principal, { action: 'DRAFT_CREATED', entityType: 'student_draft', entityId: draft.rows[0].id, correlationId: input.correlationId });
        return toDto(draft.rows[0]);
      },
    });
    return result.body;
  }

  async list(client: PoolClient, principal: Principal): Promise<StudentDraftListDto> {
    if (principal.role !== 'STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403, 'FORBIDDEN', 'Only a student integration principal can list drafts.');
    await this.authorization.assert(client, principal, 'student-drafts:manage', { studentId: principal.studentId });
    const result = await client.query<DraftRow>(`SELECT ${DRAFT_COLUMNS} FROM student_drafts WHERE student_id=$1 ORDER BY updated_at DESC,id`, [principal.studentId]);
    return { items: result.rows.map(toDto) };
  }

  async detail(client: PoolClient, principal: Principal, draftId: string): Promise<StudentDraftDto> {
    if (principal.role !== 'STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403, 'FORBIDDEN', 'Only a student integration principal can read a draft.');
    await this.authorization.assert(client, principal, 'student-drafts:manage', { studentId: principal.studentId });
    const result = await client.query<DraftRow>(`SELECT ${DRAFT_COLUMNS} FROM student_drafts WHERE id=$1 AND student_id=$2`, [draftId, principal.studentId]);
    if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Draft not found.');
    return toDto(result.rows[0]);
  }

  async update(client: PoolClient, principal: Principal, draftId: string, input: { payload: Record<string, unknown>; expectedRevision: number; idempotencyKey: string; correlationId: string }): Promise<StudentDraftDto> {
    if (principal.role !== 'STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403, 'FORBIDDEN', 'Only a student integration principal can update a draft.');
    await this.authorization.assert(client, principal, 'student-drafts:manage', { studentId: principal.studentId });
    const result = await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'draft.update',
      request: { draftId, payload: input.payload, expectedRevision: input.expectedRevision },
      responseStatus: 200,
      execute: async () => {
        const existing = await client.query<{ student_id: string; revision: number }>('SELECT student_id,revision FROM student_drafts WHERE id=$1 FOR UPDATE', [draftId]);
        if (!existing.rowCount || existing.rows[0].student_id !== principal.studentId) throw new ApiProblem(404, 'NOT_FOUND', 'Draft not found.');
        assertOptimisticLock(input.expectedRevision, existing.rows[0].revision);
        const updated = await client.query<DraftRow>(
          `UPDATE student_drafts SET payload=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING ${DRAFT_COLUMNS}`,
          [input.payload, draftId],
        );
        await this.audit.append(client, principal, { action: 'DRAFT_UPDATED', entityType: 'student_draft', entityId: draftId, correlationId: input.correlationId });
        return toDto(updated.rows[0]);
      },
    });
    return result.body;
  }
}
