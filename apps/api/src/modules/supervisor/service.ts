import type { PoolClient } from 'pg';
import { ApiProblem } from '../../security/errors.js';
import type { Principal } from '../../security/auth.js';
import type { AuthService } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';
import { SupervisorAuthorizationEngine } from './authorization.js';
import { ClinicalEvaluationPolicy } from '@dentpilot/domain';
import type {
  DutyScheduleDetailDto,
  DutyScheduleDto,
  DutyScheduleListDto,
  DutyShiftDto,
  SupervisorCaseDetailDto,
  SupervisorDutyCaseDto,
  SupervisorDutyDto,
  SupervisorGrantDto,
  SupervisorGrantListDto,
  SupervisorListDto,
  SupervisorSummaryDto,
  SupervisorAction,
  SupervisorCapabilitiesDto,
  SupervisorDailySheetDto,
  SupervisorDailySheetItemDto,
  SupervisorHistoryDayDto,
  SupervisorHistoryDayItemDto,
  SupervisorHistoryShiftDto,
  SupervisorNextAction,
  SupervisorReviewQueueDto,
  SupervisorReviewQueueItemDto,
  SupervisorWorkSummaryDto,
} from '@dentpilot/contracts';
import { CasesService } from '../cases/service.js';

interface SupervisorCaseReadRow {
  snapshot_id: string;
  case_sheet_id: string;
  student_id: string;
  student_number: string;
  student_display_name: string;
  department_id: string;
  department_name: string;
  requirement_id: string | null;
  subject_code: string | null;
  subject_name: string | null;
  shift_id: string;
  shift_starts_at: Date;
  shift_ends_at: Date;
  shift_timezone: string;
  case_status: SupervisorDailySheetItemDto['case_status'];
  start_status: 'PENDING' | 'APPROVED';
  completion_status: 'PENDING' | 'APPROVED';
  evaluation_status: 'PENDING' | 'RECORDED';
  evaluation_score: string | null;
  feedback_exists: boolean;
}

function nextActionForRow(row: SupervisorCaseReadRow): SupervisorNextAction {
  if (row.start_status === 'PENDING') return 'START_APPROVAL';
  if (row.completion_status === 'PENDING') return 'COMPLETION_APPROVAL';
  if (row.evaluation_status === 'PENDING') return 'EVALUATION';
  if (!row.feedback_exists) return 'FEEDBACK';
  return 'NONE';
}

function mapDailyItem(row: SupervisorCaseReadRow, allowedActions: SupervisorAction[]): SupervisorDailySheetItemDto {
  return {
    snapshot_id: row.snapshot_id,
    case_sheet_id: row.case_sheet_id,
    student_id: row.student_id,
    student_number: row.student_number,
    student_display_name: row.student_display_name,
    department_id: row.department_id,
    department_name: row.department_name,
    requirement_id: row.requirement_id,
    subject_code: row.subject_code,
    subject_name: row.subject_name,
    shift_id: row.shift_id,
    shift_starts_at: row.shift_starts_at.toISOString(),
    shift_ends_at: row.shift_ends_at.toISOString(),
    case_status: row.case_status,
    start_status: row.start_status,
    completion_status: row.completion_status,
    evaluation_status: row.evaluation_status,
    evaluation_score: row.evaluation_score === null ? null : Number(row.evaluation_score),
    next_action: nextActionForRow(row),
    allowedActions,
  };
}

export class SupervisorService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly authEngine: SupervisorAuthorizationEngine,
    private readonly cases: CasesService,
    private readonly auth: AuthService
  ) {}

  // ==========================================
  // ==========================================
  // UNIVERSITY CONTROL APIS
  // ==========================================

  async listSupervisors(client: PoolClient, principal: Principal): Promise<SupervisorListDto> {
    if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const query = principal.role === 'UNIVERSITY_ADMIN' 
      ? `SELECT fp.account_id as id, fp.active, fp.display_name, a.email
         FROM faculty_profiles fp
         JOIN accounts a ON a.id = fp.account_id
         WHERE fp.organization_id=$1`
      : `SELECT DISTINCT fp.account_id as id, fp.active, fp.display_name, a.email
         FROM faculty_profiles fp
         JOIN accounts a ON a.id = fp.account_id
         JOIN supervisor_assignments sa ON sa.supervisor_account_id = fp.account_id
         JOIN account_scopes s ON s.account_id = $2
         WHERE fp.organization_id=$1 
           AND (s.department_id IS NULL OR sa.department_id = s.department_id)
           AND (s.academic_year_id IS NULL OR sa.academic_year_id = s.academic_year_id)
           AND (s.academic_level_id IS NULL OR sa.academic_level_id = s.academic_level_id)
           AND (s.cohort_id IS NULL OR sa.cohort_id = s.cohort_id)`;
    const params = principal.role === 'UNIVERSITY_ADMIN' ? [principal.organizationId] : [principal.organizationId, principal.accountId];
    const result = await client.query<SupervisorSummaryDto>(query, params);
    return { items: result.rows };
  }

  async getSupervisorDetail(client: PoolClient, principal: Principal, accountId: string): Promise<SupervisorSummaryDto> {
    if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const query = principal.role === 'UNIVERSITY_ADMIN'
      ? `SELECT fp.account_id as id, fp.active, fp.display_name, a.email
         FROM faculty_profiles fp
         JOIN accounts a ON a.id = fp.account_id
         WHERE fp.organization_id=$1 AND fp.account_id=$2`
      : `SELECT DISTINCT fp.account_id as id, fp.active, fp.display_name, a.email
         FROM faculty_profiles fp
         JOIN accounts a ON a.id = fp.account_id
         JOIN supervisor_assignments sa ON sa.supervisor_account_id = fp.account_id
         JOIN account_scopes s ON s.account_id = $3
         WHERE fp.organization_id=$1 AND fp.account_id=$2
           AND (s.department_id IS NULL OR sa.department_id = s.department_id)
           AND (s.academic_year_id IS NULL OR sa.academic_year_id = s.academic_year_id)
           AND (s.academic_level_id IS NULL OR sa.academic_level_id = s.academic_level_id)
           AND (s.cohort_id IS NULL OR sa.cohort_id = s.cohort_id)`;
    const params = principal.role === 'UNIVERSITY_ADMIN' ? [principal.organizationId, accountId] : [principal.organizationId, accountId, principal.accountId];
    const result = await client.query<SupervisorSummaryDto>(query, params);
    if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Supervisor not found.');
    return result.rows[0];
  }

  async getSupervisorGrants(client: PoolClient, principal: Principal, accountId: string): Promise<SupervisorGrantListDto> {
    if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    
    // First verify they have access to this supervisor
    await this.getSupervisorDetail(client, principal, accountId);

    const result = await client.query<SupervisorGrantDto>(
      `SELECT spg.id, spg.permission_set_version_id, spg.effective_from AS granted_at, spg.effective_to AS revoked_at,
              sa.id as assignment_id, sa.department_id
       FROM supervisor_permission_grants spg
       JOIN supervisor_assignments sa ON sa.id = spg.assignment_id
       WHERE sa.organization_id = $1 AND sa.supervisor_account_id = $2
       ORDER BY spg.effective_from DESC`,
      [principal.organizationId, accountId]
    );
    return { items: result.rows };
  }

  async reissueInvitation(client: PoolClient, principal: Principal, invitationId: string, idempotencyKey: string, correlationId: string): Promise<{invitationToken?:string}> {
    return await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.reissue-invitation',
      request: { invitationId },
      responseStatus: 201,
      execute: async () => {
        await this.authorization.assert(client, principal, 'invitations:issue');
        // Correct column name: `role` (not `role_name`). Correct status predicate: revoked_at/used_at/expires_at (no `status` column).
        const old = await client.query<{ email: string; role: string }>(
          'SELECT email, role FROM invitations WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL AND used_at IS NULL AND expires_at > now()',
          [invitationId, principal.organizationId]
        );
        if (!old.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Pending invitation not found.');
        
        const row = old.rows[0];
        if (row.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(400, 'VALIDATION_ERROR', 'Not a supervisor invitation.');
        
        // Soft-revoke — preserve the audit trail; do NOT DELETE.
        await client.query('UPDATE invitations SET revoked_at = now() WHERE id=$1 AND organization_id=$2', [invitationId, principal.organizationId]);
        
        // Token generation stays inside AuthService — SupervisorService never calls crypto directly.
        const token = await this.auth.issueInvitationOnClient(client, principal, row.email, 'CLINICAL_SUPERVISOR', null, correlationId);
        
        await this.audit.append(client, principal, { action: 'INVITATION_REISSUED', entityType: 'invitation', entityId: invitationId, correlationId });
        return { invitationToken: process.env.NODE_ENV === 'development' ? token : undefined };
      }
    }).then(r => r.body);
  }

  async revokeInvitation(client: PoolClient, principal: Principal, invitationId: string, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.revoke-invitation',
      request: { invitationId },
      responseStatus: 204,
      execute: async () => {
        await this.authorization.assert(client, principal, 'invitations:issue');
        const result = await client.query('DELETE FROM invitations WHERE id=$1 AND organization_id=$2 AND status=\'PENDING\' RETURNING id', [invitationId, principal.organizationId]);
        if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Pending invitation not found.');
        await this.audit.append(client, principal, { action: 'INVITATION_REVOKED', entityType: 'invitation', entityId: invitationId, correlationId });
        return {};
      }
    });
  }

  async setSupervisorStatus(client: PoolClient, principal: Principal, accountId: string, active: boolean, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.set-status',
      request: { accountId, active },
      responseStatus: 204,
      execute: async () => {
        if (principal.role !== 'UNIVERSITY_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Only UNIVERSITY_ADMIN can manage supervisor accounts.');
        const result = await client.query('UPDATE faculty_profiles SET active=$3 WHERE account_id=$1 AND organization_id=$2 RETURNING id', [accountId, principal.organizationId, active]);
        if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Faculty profile not found.');
        await this.audit.append(client, principal, { action: active ? 'SUPERVISOR_ACTIVATED' : 'SUPERVISOR_DISABLED', entityType: 'account', entityId: accountId, correlationId });
        return {};
      }
    });
  }

  async grantPermission(client: PoolClient, principal: Principal, assignmentId: string, permissionSetVersionId: string, idempotencyKey: string, correlationId: string): Promise<{id:string}> {
    return await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.grant-permission',
      request: { assignmentId, permissionSetVersionId },
      responseStatus: 201,
      execute: async () => {
        if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
        
        if (principal.role === 'DEPARTMENT_ADMIN') {
          const scopeCheck = await client.query(
            `SELECT 1 FROM supervisor_assignments sa
             JOIN account_scopes s ON s.account_id = $2
             WHERE sa.id = $1 
               AND (s.department_id IS NULL OR sa.department_id = s.department_id)
               AND (s.academic_year_id IS NULL OR sa.academic_year_id = s.academic_year_id)
               AND (s.academic_level_id IS NULL OR sa.academic_level_id = s.academic_level_id)
               AND (s.cohort_id IS NULL OR sa.cohort_id = s.cohort_id)
             LIMIT 1`,
            [assignmentId, principal.accountId]
          );
          if (!scopeCheck.rowCount) throw new ApiProblem(403, 'FORBIDDEN', 'Assignment outside of authorized scope.');
        }

        const result = await client.query<{id:string}>('INSERT INTO supervisor_permission_grants(organization_id, assignment_id, permission_set_version_id, effective_from) VALUES ($1, $2, $3, now()) RETURNING id', [principal.organizationId, assignmentId, permissionSetVersionId]);
        await this.audit.append(client, principal, { action: 'PERMISSION_GRANTED', entityType: 'supervisor_assignment', entityId: assignmentId, correlationId });
        return { id: result.rows[0].id };
      }
    }).then(r => r.body);
  }

  async revokePermission(client: PoolClient, principal: Principal, grantId: string, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.revoke-permission',
      request: { grantId },
      responseStatus: 204,
      execute: async () => {
        if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
        
        if (principal.role === 'DEPARTMENT_ADMIN') {
          const scopeCheck = await client.query(
            `SELECT 1 FROM supervisor_permission_grants spg
             JOIN supervisor_assignments sa ON sa.id = spg.assignment_id
             JOIN account_scopes s ON s.account_id = $2
             WHERE spg.id = $1 
               AND (s.department_id IS NULL OR sa.department_id = s.department_id)
               AND (s.academic_year_id IS NULL OR sa.academic_year_id = s.academic_year_id)
               AND (s.academic_level_id IS NULL OR sa.academic_level_id = s.academic_level_id)
               AND (s.cohort_id IS NULL OR sa.cohort_id = s.cohort_id)
             LIMIT 1`,
            [grantId, principal.accountId]
          );
          if (!scopeCheck.rowCount) throw new ApiProblem(403, 'FORBIDDEN', 'Grant outside of authorized scope.');
        }

        const result = await client.query('UPDATE supervisor_permission_grants SET effective_to=now() WHERE id=$1 AND organization_id=$2 AND (effective_to IS NULL OR effective_to > now()) RETURNING id', [grantId, principal.organizationId]);
        if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Active grant not found.');
        await this.audit.append(client, principal, { action: 'PERMISSION_REVOKED', entityType: 'supervisor_permission_grant', entityId: grantId, correlationId });
        return {};
      }
    });
  }

  // ==========================================
  // DUTY MANAGEMENT
  // ==========================================

  async createSchedule(client: PoolClient, principal: Principal, departmentId: string, academicYearId: string, timezone: string, validFrom: string, validTo: string, idempotencyKey: string, correlationId: string): Promise<{id:string}> {
    return await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'duty.create-schedule',
      request: { departmentId, academicYearId, timezone, validFrom, validTo },
      responseStatus: 201,
      execute: async () => {
        await this.authorization.assert(client, principal, 'rosters:manage', { departmentId, academicYearId });
        const result = await client.query<{id:string}>('INSERT INTO clinical_duty_schedules(organization_id, department_id, academic_year_id, timezone, valid_from, valid_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [principal.organizationId, departmentId, academicYearId, timezone, validFrom, validTo]);
        await this.audit.append(client, principal, { action: 'SCHEDULE_CREATED', entityType: 'clinical_duty_schedule', entityId: result.rows[0].id, departmentId, correlationId });
        return { id: result.rows[0].id };
      }
    }).then(r => r.body);
  }

  async createShift(client: PoolClient, principal: Principal, scheduleId: string, startsAt: string, endsAt: string, idempotencyKey: string, correlationId: string): Promise<{id:string}> {
    return await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'duty.create-shift',
      request: { scheduleId, startsAt, endsAt },
      responseStatus: 201,
      execute: async () => {
        const sched = await client.query('SELECT department_id, academic_year_id FROM clinical_duty_schedules WHERE id=$1 AND organization_id=$2', [scheduleId, principal.organizationId]);
        if (!sched.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Schedule not found.');
        
        // Explicit authorization
        await this.authorization.assert(client, principal, 'rosters:manage', { departmentId: sched.rows[0].department_id, academicYearId: sched.rows[0].academic_year_id });
        
        const result = await client.query<{id:string}>('INSERT INTO clinical_duty_shifts(organization_id, schedule_id, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING id', [principal.organizationId, scheduleId, startsAt, endsAt]);
        await this.audit.append(client, principal, { action: 'SHIFT_CREATED', entityType: 'clinical_duty_shift', entityId: result.rows[0].id, departmentId: sched.rows[0].department_id, correlationId });
        return { id: result.rows[0].id };
      }
    }).then(r => r.body);
  }

  async addShiftMember(client: PoolClient, principal: Principal, shiftId: string, assignmentId: string, grantId: string, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'duty.add-member',
      request: { shiftId, assignmentId, grantId },
      responseStatus: 204,
      execute: async () => {
        const shift = await client.query(
          'SELECT s.department_id, s.academic_year_id FROM clinical_duty_shifts sh JOIN clinical_duty_schedules s ON s.id = sh.schedule_id WHERE sh.id=$1 AND sh.organization_id=$2', 
          [shiftId, principal.organizationId]
        );
        if (!shift.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Shift not found.');
        
        // Explicit authorization
        await this.authorization.assert(client, principal, 'rosters:manage', { departmentId: shift.rows[0].department_id, academicYearId: shift.rows[0].academic_year_id });

        await client.query('INSERT INTO clinical_duty_members(organization_id, shift_id, assignment_id, grant_id) VALUES ($1, $2, $3, $4)', [principal.organizationId, shiftId, assignmentId, grantId]);
        await this.audit.append(client, principal, { action: 'SHIFT_MEMBER_ADDED', entityType: 'clinical_duty_shift', entityId: shiftId, correlationId });
        return {};
      }
    });
  }

  async listSchedules(client: PoolClient, principal: Principal): Promise<DutyScheduleListDto> {
    await this.authorization.assert(client, principal, 'rosters:manage');
    const result = await client.query<DutyScheduleDto>(
      `SELECT id, department_id, academic_year_id, timezone, valid_from, valid_to 
       FROM clinical_duty_schedules 
       WHERE organization_id = $1 
       ORDER BY valid_from DESC`,
      [principal.organizationId]
    );
    return { items: result.rows };
  }

  async getScheduleDetail(client: PoolClient, principal: Principal, scheduleId: string): Promise<DutyScheduleDetailDto> {
    await this.authorization.assert(client, principal, 'rosters:manage');
    
    const schedResult = await client.query<DutyScheduleDto>(
      `SELECT id, department_id, academic_year_id, timezone, valid_from, valid_to 
       FROM clinical_duty_schedules 
       WHERE id = $1 AND organization_id = $2`,
      [scheduleId, principal.organizationId]
    );
    if (!schedResult.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Schedule not found.');
    
    const shiftsResult = await client.query<DutyShiftDto>(
      `SELECT s.id, s.starts_at, s.ends_at, s.status,
              json_agg(json_build_object(
                'member_id', m.id, 
                'assignment_id', m.assignment_id,
                'supervisor_name', fp.display_name
              )) filter (where m.id is not null) as members
       FROM clinical_duty_shifts s
       LEFT JOIN clinical_duty_members m ON m.shift_id = s.id
       LEFT JOIN supervisor_assignments sa ON sa.id = m.assignment_id
       LEFT JOIN faculty_profiles fp ON fp.account_id = sa.supervisor_account_id
       WHERE s.schedule_id = $1 AND s.organization_id = $2
       GROUP BY s.id
       ORDER BY s.starts_at ASC`,
      [scheduleId, principal.organizationId]
    );
    
    return {
      ...schedResult.rows[0],
      shifts: shiftsResult.rows
    };
  }

  // ==========================================
  // SUPERVISOR READ MODELS
  // ==========================================

  private async readSupervisorCaseRows(client: PoolClient, principal: Principal, mode: 'current' | 'queue' | 'day', day?: string): Promise<Array<SupervisorCaseReadRow & { performed_actions?: string[]; status_at_day_end?: SupervisorDailySheetItemDto['case_status'] }>> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const params: unknown[] = [principal.organizationId, principal.accountId];
    const filters: string[] = [
      'ss.organization_id = $1',
      'sa.supervisor_account_id = $2',
      'cs.latest_snapshot_id = ss.id',
      'ss.department_id = sa.department_id',
      'ss.academic_year_id = sa.academic_year_id',
      'ss.academic_level_id = sa.academic_level_id',
      '(sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)',
      '(sa.group_id IS NULL OR ss.group_id = sa.group_id)',
    ];
    if (mode === 'day') filters.push("sa.status <> 'REMOVED'");
    else filters.push("sa.status = 'ACTIVE'");
    if (mode === 'current') filters.push("sh.starts_at <= now() AND sh.ends_at >= now() AND sh.status = 'ACTIVE'");
    if (mode === 'queue') filters.push("sh.starts_at <= now() AND cs.current_status <> 'GRADED'");
    if (mode === 'day') {
      if (!day) throw new ApiProblem(400, 'VALIDATION_ERROR', 'A history date is required.');
      params.push(day);
      filters.push("(sh.starts_at AT TIME ZONE sch.timezone)::date = $3::date");
    }
    const statusAtDayEnd = mode === 'day' ? `,
      COALESCE((SELECT CASE ae.action
        WHEN 'APPROVED_START' THEN 'APPROVED_START'
        WHEN 'APPROVED_FINAL' THEN 'APPROVED_FINAL'
        WHEN 'GRADE_RECORDED' THEN 'GRADED'
        WHEN 'GRADE_AMENDED' THEN 'GRADED'
        WHEN 'REVISION_REQUESTED' THEN 'REVISION_REQUESTED'
        WHEN 'CASE_SUBMITTED' THEN 'SUBMITTED'
        ELSE NULL END
       FROM audit_events ae
       WHERE ae.organization_id = ss.organization_id
         AND ae.entity_type = 'submission_snapshot'
         AND ae.entity_id = ss.id
         AND ae.created_at < ($3::date + interval '1 day')
       ORDER BY ae.created_at DESC, ae.id DESC LIMIT 1), 'SUBMITTED')::submission_status AS status_at_day_end,
      COALESCE((SELECT array_agg(ae.action ORDER BY ae.created_at, ae.id)
       FROM audit_events ae
       WHERE ae.organization_id = ss.organization_id
         AND ae.entity_type = 'submission_snapshot'
         AND ae.entity_id = ss.id
         AND ae.actor_account_id = $2
         AND ae.created_at < ($3::date + interval '1 day')), ARRAY[]::text[]) AS performed_actions` : '';
    const result = await client.query<SupervisorCaseReadRow & { performed_actions?: string[]; status_at_day_end?: SupervisorDailySheetItemDto['case_status'] }>(
      `SELECT ss.id AS snapshot_id,
              cs.id AS case_sheet_id,
              ss.student_id,
              st.student_number,
              st.display_name AS student_display_name,
              ss.department_id,
              d.name AS department_name,
              ss.requirement_id,
              COALESCE(req.code, d.code) AS subject_code,
              COALESCE(req.label, d.name) AS subject_name,
              sh.id AS shift_id,
              sh.starts_at AS shift_starts_at,
              sh.ends_at AS shift_ends_at,
              sch.timezone AS shift_timezone,
              cs.current_status AS case_status,
              CASE WHEN EXISTS (SELECT 1 FROM clinical_decisions cd WHERE cd.snapshot_id = ss.id AND cd.decision_type = 'APPROVE_START') THEN 'APPROVED' ELSE 'PENDING' END AS start_status,
              CASE WHEN EXISTS (SELECT 1 FROM clinical_decisions cd WHERE cd.snapshot_id = ss.id AND cd.decision_type = 'APPROVE_FINAL') THEN 'APPROVED' ELSE 'PENDING' END AS completion_status,
              CASE WHEN EXISTS (SELECT 1 FROM clinical_evaluation_events ce WHERE ce.snapshot_id = ss.id) THEN 'RECORDED' ELSE 'PENDING' END AS evaluation_status,
              (SELECT ce.score::text FROM clinical_evaluation_events ce WHERE ce.snapshot_id = ss.id ORDER BY ce.created_at DESC, ce.id DESC LIMIT 1) AS evaluation_score,
              EXISTS (SELECT 1 FROM supervisor_notes sn WHERE sn.snapshot_id = ss.id AND sn.author_account_id = $2) AS feedback_exists
              ${statusAtDayEnd}
       FROM clinical_case_duty_links cdl
       JOIN case_sheets cs ON cs.id = cdl.case_sheet_id
       JOIN submission_snapshots ss ON ss.id = cs.latest_snapshot_id
       JOIN students st ON st.id = ss.student_id
       JOIN departments d ON d.id = ss.department_id
       LEFT JOIN requirements req ON req.id = ss.requirement_id
       JOIN clinical_duty_shifts sh ON sh.id = cdl.shift_id AND sh.organization_id = ss.organization_id
       JOIN clinical_duty_schedules sch ON sch.id = sh.schedule_id AND sch.organization_id = ss.organization_id
       JOIN clinical_duty_members cdm ON cdm.shift_id = sh.id AND cdm.organization_id = ss.organization_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       WHERE ${filters.join(' AND ')}
       ORDER BY sh.starts_at DESC, st.display_name ASC, ss.id ASC`,
      params,
    );
    return result.rows;
  }

  private async mapRowsToDailyItems(client: PoolClient, principal: Principal, rows: SupervisorCaseReadRow[]): Promise<SupervisorDailySheetItemDto[]> {
    return Promise.all(rows.map(async (row) => mapDailyItem(row, await this.authEngine.getAllowedActionsForSnapshot(client, principal, row.snapshot_id))));
  }

  async getDailySheet(client: PoolClient, principal: Principal): Promise<SupervisorDailySheetDto> {
    const duties = await this.getActiveDuty(client, principal);
    const rows = await this.readSupervisorCaseRows(client, principal, 'current');
    return { duty: duties[0] ?? null, items: await this.mapRowsToDailyItems(client, principal, rows), generated_at: new Date().toISOString() };
  }

  async getReviewQueue(client: PoolClient, principal: Principal): Promise<SupervisorReviewQueueDto> {
    const rows = await this.readSupervisorCaseRows(client, principal, 'queue');
    const items: SupervisorReviewQueueItemDto[] = [];
    for (const row of rows) {
      const allowedActions = await this.authEngine.getAllowedActionsForSnapshot(client, principal, row.snapshot_id);
      const item = mapDailyItem(row, allowedActions);
      if (item.next_action === 'NONE') continue;
      const actionRequired: SupervisorNextAction = item.next_action;
      const actionMap: Partial<Record<SupervisorNextAction, SupervisorAction>> = {
        START_APPROVAL: 'START_APPROVAL',
        COMPLETION_APPROVAL: 'COMPLETION_APPROVAL',
        EVALUATION: 'CASESHEET_EVALUATION',
        FEEDBACK: 'CLINICAL_FEEDBACK',
      };
      const requiredAction = actionMap[actionRequired];
      items.push({
        ...item,
        action_required: actionRequired,
        original_duty_date: new Intl.DateTimeFormat('en-CA', { timeZone: row.shift_timezone }).format(row.shift_starts_at),
        is_action_allowed_now: requiredAction ? allowedActions.includes(requiredAction) : false,
      });
    }
    return { items, generated_at: new Date().toISOString() };
  }

  async getHistoryDay(client: PoolClient, principal: Principal, day: string): Promise<SupervisorHistoryDayDto> {
    const rows = await this.readSupervisorCaseRows(client, principal, 'day', day);
    const items: SupervisorHistoryDayItemDto[] = [];
    const shifts = new Map<string, SupervisorHistoryShiftDto>();
    for (const row of rows) {
      shifts.set(row.shift_id, { shift_id: row.shift_id, starts_at: row.shift_starts_at.toISOString(), ends_at: row.shift_ends_at.toISOString(), status: 'CLOSED' });
      const daily = mapDailyItem(row, []);
      items.push({
        ...daily,
        status_at_day_end: row.status_at_day_end ?? daily.case_status,
        performed_actions: row.performed_actions ?? [],
        remained_pending: daily.next_action !== 'NONE',
      });
    }
    return { date: day, shifts: [...shifts.values()], items, generated_at: new Date().toISOString() };
  }

  async getWorkSummary(client: PoolClient, principal: Principal, academicYearId: string, termId?: string): Promise<SupervisorWorkSummaryDto> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const contextParams = [principal.organizationId, principal.accountId, academicYearId, termId ?? null];
    const [days, startApprovals, completionApprovals, evaluations, feedback, deferred] = await Promise.all([
      client.query<{ count: string }>(`SELECT COUNT(DISTINCT (sh.starts_at AT TIME ZONE sch.timezone)::date)::text AS count
        FROM clinical_duty_members cdm JOIN clinical_duty_shifts sh ON sh.id=cdm.shift_id JOIN clinical_duty_schedules sch ON sch.id=sh.schedule_id
        JOIN supervisor_assignments sa ON sa.id=cdm.assignment_id
        WHERE cdm.organization_id=$1 AND sa.supervisor_account_id=$2 AND sch.academic_year_id=$3 AND ($4::uuid IS NULL OR sch.term_id=$4)`, contextParams),
      client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_events ae JOIN submission_snapshots ss ON ss.id=ae.entity_id
        WHERE ae.organization_id=$1 AND ae.actor_account_id=$2 AND ae.entity_type='submission_snapshot' AND ae.action='APPROVED_START'
          AND ss.academic_year_id=$3 AND ($4::uuid IS NULL OR ss.term_id=$4)`, contextParams),
      client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM audit_events ae JOIN submission_snapshots ss ON ss.id=ae.entity_id
        WHERE ae.organization_id=$1 AND ae.actor_account_id=$2 AND ae.entity_type='submission_snapshot' AND ae.action='APPROVED_FINAL'
          AND ss.academic_year_id=$3 AND ($4::uuid IS NULL OR ss.term_id=$4)`, contextParams),
      client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM clinical_evaluation_events ce JOIN submission_snapshots ss ON ss.id=ce.snapshot_id
        WHERE ce.organization_id=$1 AND ce.evaluator_account_id=$2 AND ss.academic_year_id=$3 AND ($4::uuid IS NULL OR ss.term_id=$4)`, contextParams),
      client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM supervisor_notes sn JOIN submission_snapshots ss ON ss.id=sn.snapshot_id
        WHERE sn.organization_id=$1 AND sn.author_account_id=$2 AND ss.academic_year_id=$3 AND ($4::uuid IS NULL OR ss.term_id=$4)`, contextParams),
      this.getReviewQueue(client, principal),
    ]);
    return {
      academic_year_id: academicYearId,
      term_id: termId ?? null,
      supervision_days: Number(days.rows[0]?.count ?? 0),
      start_approvals: Number(startApprovals.rows[0]?.count ?? 0),
      completion_approvals: Number(completionApprovals.rows[0]?.count ?? 0),
      evaluations: Number(evaluations.rows[0]?.count ?? 0),
      feedback_notes: Number(feedback.rows[0]?.count ?? 0),
      deferred_work: deferred.items.filter((item) => !item.is_action_allowed_now).length,
      generated_at: new Date().toISOString(),
    };
  }

  async getCapabilities(client: PoolClient, principal: Principal): Promise<SupervisorCapabilitiesDto> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const capabilities = new Set<SupervisorCapabilitiesDto['capabilities'][number]>(['DAILY_SHEET_READ', 'REVIEW_QUEUE_READ', 'HISTORY_READ', 'WORK_SUMMARY_READ']);
    const result = await client.query<{ permission: SupervisorAction }>(
      `SELECT DISTINCT spi.permission
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts sh ON sh.id=cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id=cdm.assignment_id
       JOIN supervisor_permission_grants spg ON spg.assignment_id=sa.id AND spg.organization_id=sa.organization_id
       JOIN supervisor_permission_set_items spi ON spi.version_id=spg.permission_set_version_id AND spi.organization_id=spg.organization_id
       WHERE cdm.organization_id=$1 AND sa.supervisor_account_id=$2 AND sh.starts_at<=now() AND sh.ends_at>=now() AND sh.status='ACTIVE'
         AND sa.status='ACTIVE' AND spg.effective_from<=now() AND (spg.effective_to IS NULL OR spg.effective_to>now())`,
      [principal.organizationId, principal.accountId],
    );
    for (const row of result.rows) capabilities.add(row.permission);
    return { capabilities: [...capabilities], generated_at: new Date().toISOString() };
  }

  // ==========================================
  // SUPERVISOR APIS
  // ==========================================

  async getActiveDuty(client: PoolClient, principal: Principal): Promise<SupervisorDutyDto[]> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const result = await client.query<SupervisorDutyDto>(
      `SELECT cds.id, cds.starts_at, cds.ends_at, cdm.assignment_id 
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       WHERE cdm.organization_id = $1 
         AND sa.supervisor_account_id = $2
         AND cds.starts_at <= now() AND cds.ends_at >= now() AND cds.status = 'ACTIVE'`,
      [principal.organizationId, principal.accountId]
    );
    return result.rows;
  }

  async getUpcomingDuties(client: PoolClient, principal: Principal): Promise<SupervisorDutyDto[]> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const result = await client.query<SupervisorDutyDto>(
      `SELECT cds.id, cds.starts_at, cds.ends_at, cdm.assignment_id 
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       WHERE cdm.organization_id = $1 
         AND sa.supervisor_account_id = $2
         AND cds.starts_at > now() AND cds.status = 'ACTIVE'`,
      [principal.organizationId, principal.accountId]
    );
    return result.rows;
  }

  async listDutyCases(client: PoolClient, principal: Principal): Promise<SupervisorDutyCaseDto[]> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    // Lists cases in scope of current active duty
    const result = await client.query<SupervisorDutyCaseDto>(
      `SELECT ss.id as snapshot_id, cs.current_status
       FROM submission_snapshots ss
       JOIN case_sheets cs ON cs.id = ss.case_sheet_id AND cs.latest_snapshot_id = ss.id
       JOIN clinical_duty_members cdm ON cdm.organization_id = ss.organization_id
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       WHERE ss.organization_id = $1
         AND sa.supervisor_account_id = $2
         AND cds.starts_at <= now() AND cds.ends_at >= now() AND cds.status = 'ACTIVE'
         AND ss.department_id = sa.department_id
         AND ss.academic_year_id = sa.academic_year_id
         AND ss.academic_level_id = sa.academic_level_id
         AND (sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)
         AND (sa.group_id IS NULL OR ss.group_id = sa.group_id)`,
      [principal.organizationId, principal.accountId]
    );
    return result.rows;
  }

  async getCaseDetail(client: PoolClient, principal: Principal, snapshotId: string): Promise<SupervisorCaseDetailDto> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    // Check if the supervisor has access to this case under an active duty
    const result = await client.query<Omit<SupervisorCaseDetailDto, 'allowedActions'>>(
      `SELECT ss.id as snapshot_id, cs.current_status, ss.payload
       FROM submission_snapshots ss
       JOIN case_sheets cs ON cs.id = ss.case_sheet_id AND cs.latest_snapshot_id = ss.id
       JOIN clinical_duty_members cdm ON cdm.organization_id = ss.organization_id
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       WHERE ss.id = $1
         AND ss.organization_id = $2
         AND sa.supervisor_account_id = $3
         AND cds.starts_at <= now() AND cds.ends_at >= now() AND cds.status = 'ACTIVE'
         AND ss.department_id = sa.department_id
         AND ss.academic_year_id = sa.academic_year_id
         AND ss.academic_level_id = sa.academic_level_id
         AND (sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)
         AND (sa.group_id IS NULL OR ss.group_id = sa.group_id)
       LIMIT 1`,
      [snapshotId, principal.organizationId, principal.accountId]
    );
    if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Case not found or out of scope.');
    
    const caseData = result.rows[0];
    const allowedActions = await this.authEngine.getAllowedActionsForSnapshot(client, principal, snapshotId);
    
    return {
      ...caseData,
      allowedActions
    };
  }

  // ==========================================
  // CLINICAL MUTATIONS
  // ==========================================

  async startApproval(client: PoolClient, principal: Principal, snapshotId: string, idempotencyKey: string, correlationId: string): Promise<void> {
    const assignmentId = await this.authEngine.resolveAssignmentId(client, principal, snapshotId);
    await this.authEngine.authorizeAction(client, principal, 'START_APPROVAL', { assignmentId, snapshotId });
    // Delegate to existing cases service
    await this.cases.approve(client, principal, snapshotId, 'APPROVED_START', idempotencyKey, correlationId);
  }

  async completionApproval(client: PoolClient, principal: Principal, snapshotId: string, idempotencyKey: string, correlationId: string): Promise<void> {
    const assignmentId = await this.authEngine.resolveAssignmentId(client, principal, snapshotId);
    await this.authEngine.authorizeAction(client, principal, 'COMPLETION_APPROVAL', { assignmentId, snapshotId });
    await this.cases.approve(client, principal, snapshotId, 'APPROVED_FINAL', idempotencyKey, correlationId);
  }

  async evaluateCase(client: PoolClient, principal: Principal, snapshotId: string, score: number, idempotencyKey: string, correlationId: string): Promise<void> {
    // Domain validation first — before any DB access.
    ClinicalEvaluationPolicy.validateScore(score);
    // Resolve duty_member_id + permission_set_version_id server-side.
    // These are required NOT NULL columns in clinical_evaluation_events (0004 schema).
    const evalCtx = await this.authEngine.resolveEvaluationContext(client, principal, snapshotId);
    // Re-check the specific permission through the authorisation engine.
    await this.authEngine.authorizeAction(client, principal, 'CASESHEET_EVALUATION', { assignmentId: evalCtx.assignmentId, snapshotId });
    
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.evaluate',
      request: { snapshotId, score },
      responseStatus: 204,
      execute: async () => {
        // Columns match migration 0004 exactly: duty_member_id + permission_set_version_id
        // are resolved from server context — never provided by the client.
        await client.query(
          'INSERT INTO clinical_evaluation_events(organization_id, snapshot_id, evaluator_account_id, duty_member_id, permission_set_version_id, score) VALUES ($1, $2, $3, $4, $5, $6)',
          [principal.organizationId, snapshotId, principal.accountId, evalCtx.dutyMemberId, evalCtx.permissionSetVersionId, score]
        );
        await this.audit.append(client, principal, { action: 'CLINICAL_EVALUATION_SUBMITTED', entityType: 'submission_snapshot', entityId: snapshotId, correlationId });
        return {};
      }
    });
  }

  async provideFeedback(client: PoolClient, principal: Principal, snapshotId: string, body: string, studentVisible: boolean, idempotencyKey: string, correlationId: string): Promise<void> {
    const assignmentId = await this.authEngine.resolveAssignmentId(client, principal, snapshotId);
    await this.authEngine.authorizeAction(client, principal, 'CLINICAL_FEEDBACK', { assignmentId, snapshotId });
    
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'supervisor.feedback',
      request: { snapshotId, body, studentVisible },
      responseStatus: 204,
      execute: async () => {
        // Reuse supervisor_notes for feedback
        await client.query('INSERT INTO supervisor_notes(organization_id, snapshot_id, author_account_id, body, student_visible) VALUES ($1, $2, $3, $4, $5)', [principal.organizationId, snapshotId, principal.accountId, body, studentVisible]);
        await this.audit.append(client, principal, { action: 'CLINICAL_FEEDBACK_PROVIDED', entityType: 'submission_snapshot', entityId: snapshotId, correlationId });
        return {};
      }
    });
  }
}
