import type { PoolClient } from 'pg';
import { ApiProblem } from '../../security/errors.js';
import type { Principal } from '../../security/auth.js';
import type { AuthService } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';
import { SupervisorAuthorizationEngine } from './authorization.js';
import { ClinicalEvaluationPolicy, type SupervisorAction } from '@dentpilot/domain';
import { CasesService } from '../cases/service.js';

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

  async listSupervisors(client: PoolClient, principal: Principal): Promise<unknown> {
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
    const result = await client.query(query, params);
    return { items: result.rows };
  }

  async getSupervisorDetail(client: PoolClient, principal: Principal, accountId: string): Promise<unknown> {
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
    const result = await client.query(query, params);
    if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Supervisor not found.');
    return result.rows[0];
  }

  async getSupervisorGrants(client: PoolClient, principal: Principal, accountId: string): Promise<unknown> {
    if (principal.role !== 'UNIVERSITY_ADMIN' && principal.role !== 'DEPARTMENT_ADMIN') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    
    // First verify they have access to this supervisor
    await this.getSupervisorDetail(client, principal, accountId);

    const result = await client.query(
      `SELECT spg.id, spg.permission_set_version_id, spg.granted_at, spg.revoked_at,
              sa.id as assignment_id, sa.department_id
       FROM supervisor_permission_grants spg
       JOIN supervisor_assignments sa ON sa.id = spg.assignment_id
       WHERE sa.organization_id = $1 AND sa.supervisor_account_id = $2
       ORDER BY spg.granted_at DESC`,
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

  async listSchedules(client: PoolClient, principal: Principal): Promise<unknown> {
    await this.authorization.assert(client, principal, 'rosters:manage');
    const result = await client.query(
      `SELECT id, department_id, academic_year_id, timezone, valid_from, valid_to 
       FROM clinical_duty_schedules 
       WHERE organization_id = $1 
       ORDER BY valid_from DESC`,
      [principal.organizationId]
    );
    return { items: result.rows };
  }

  async getScheduleDetail(client: PoolClient, principal: Principal, scheduleId: string): Promise<unknown> {
    await this.authorization.assert(client, principal, 'rosters:manage');
    
    const schedResult = await client.query(
      `SELECT id, department_id, academic_year_id, timezone, valid_from, valid_to 
       FROM clinical_duty_schedules 
       WHERE id = $1 AND organization_id = $2`,
      [scheduleId, principal.organizationId]
    );
    if (!schedResult.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'Schedule not found.');
    
    const shiftsResult = await client.query(
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
  // SUPERVISOR APIS
  // ==========================================

  async getActiveDuty(client: PoolClient, principal: Principal): Promise<unknown> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const result = await client.query(
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

  async getUpcomingDuties(client: PoolClient, principal: Principal): Promise<unknown> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    const result = await client.query(
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

  async listDutyCases(client: PoolClient, principal: Principal): Promise<unknown> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    // Lists cases in scope of current active duty
    const result = await client.query(
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

  async getCaseDetail(client: PoolClient, principal: Principal, snapshotId: string): Promise<unknown> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') throw new ApiProblem(403, 'FORBIDDEN', 'Access denied.');
    // Check if the supervisor has access to this case under an active duty
    const result = await client.query(
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
