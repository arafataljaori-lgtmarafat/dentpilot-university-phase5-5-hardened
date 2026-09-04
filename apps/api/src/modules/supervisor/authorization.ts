import type { PoolClient } from 'pg';
import type { Principal } from '../../security/auth.js';
import { ApiProblem } from '../../security/errors.js';
import type { SupervisorAction } from '@dentpilot/domain';
import { SupervisorDutyResolver, SupervisorPermissionResolver, SupervisorScopeValidator } from './resolvers.js';

export interface SupervisorActionContext {
  assignmentId: string;
  snapshotId: string;
}

export class SupervisorAuthorizationEngine {
  constructor(
    private readonly dutyResolver: SupervisorDutyResolver = new SupervisorDutyResolver(),
    private readonly permissionResolver: SupervisorPermissionResolver = new SupervisorPermissionResolver(),
    private readonly scopeValidator: SupervisorScopeValidator = new SupervisorScopeValidator(),
  ) {}

  async authorizeAction(
    client: PoolClient,
    principal: Principal,
    action: SupervisorAction,
    context: SupervisorActionContext
  ): Promise<void> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') {
      throw new ApiProblem(403, 'FORBIDDEN', 'Only clinical supervisors can perform supervisor actions.');
    }

    // 1. Validate Scope Match
    await this.scopeValidator.validateScope(client, principal.organizationId, context.assignmentId, context.snapshotId);

    // 2. Validate Active Duty
    await this.dutyResolver.resolveActiveDuty(client, principal.organizationId, context.assignmentId);

    // 3. Resolve Permissions and Verify
    const activePermissions = await this.permissionResolver.resolvePermissions(client, principal.organizationId, context.assignmentId);
    
    if (!activePermissions.includes(action)) {
      throw new ApiProblem(403, 'FORBIDDEN', `Supervisor lacks permission for action: ${action}`);
    }
  }

  async resolveAssignmentId(client: PoolClient, principal: Principal, snapshotId: string): Promise<string> {
    const result = await client.query<{ assignment_id: string }>(
      `SELECT cdm.assignment_id
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id = cdm.assignment_id
       JOIN submission_snapshots ss ON ss.id = $2
       WHERE cdm.organization_id = $1
         AND sa.supervisor_account_id = $3
         AND cds.starts_at <= now()
         AND cds.ends_at >= now()
         AND cds.status = 'ACTIVE'
         AND ss.organization_id = $1
         AND ss.department_id = sa.department_id
         AND ss.academic_year_id = sa.academic_year_id
         AND ss.academic_level_id = sa.academic_level_id
         AND (sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)
         AND (sa.group_id IS NULL OR ss.group_id = sa.group_id)
       LIMIT 1`,
      [principal.organizationId, snapshotId, principal.accountId]
    );
    if (result.rowCount === 0) {
      throw new ApiProblem(403, 'FORBIDDEN', 'No active duty assignment covers this case sheet.');
    }
    return result.rows[0].assignment_id;
  }

  /**
   * Resolves the full evaluation context required for writing a
   * clinical_evaluation_events row.  Combines scope, duty, and
   * active-grant checks in a single query so that duty_member_id
   * and permission_set_version_id are sourced from the server —
   * never supplied by the client.
   */
  async resolveEvaluationContext(
    client: PoolClient,
    principal: Principal,
    snapshotId: string
  ): Promise<{ assignmentId: string; dutyMemberId: string; permissionSetVersionId: string }> {
    if (principal.role !== 'CLINICAL_SUPERVISOR') {
      throw new ApiProblem(403, 'FORBIDDEN', 'Only clinical supervisors can perform supervisor actions.');
    }
    const result = await client.query<{
      assignment_id: string;
      duty_member_id: string;
      permission_set_version_id: string;
    }>(
      `SELECT cdm.assignment_id,
              cdm.id              AS duty_member_id,
              spg.permission_set_version_id
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts cds  ON cds.id  = cdm.shift_id
       JOIN supervisor_assignments sa ON sa.id   = cdm.assignment_id
       JOIN submission_snapshots   ss ON ss.id   = $2
       JOIN supervisor_permission_grants spg
         ON  spg.assignment_id   = cdm.assignment_id
         AND spg.organization_id = $1
         AND spg.effective_from <= now()
         AND (spg.effective_to IS NULL OR spg.effective_to > now())
       WHERE cdm.organization_id = $1
         AND sa.supervisor_account_id = $3
         AND sa.status        = 'ACTIVE'
         AND cds.starts_at   <= now()
         AND cds.ends_at     >= now()
         AND cds.status       = 'ACTIVE'
         AND ss.organization_id     = $1
         AND ss.department_id       = sa.department_id
         AND ss.academic_year_id    = sa.academic_year_id
         AND ss.academic_level_id   = sa.academic_level_id
         AND (sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)
         AND (sa.group_id   IS NULL OR ss.group_id  = sa.group_id)
       LIMIT 1`,
      [principal.organizationId, snapshotId, principal.accountId]
    );
    if (result.rowCount === 0) {
      throw new ApiProblem(403, 'FORBIDDEN', 'No active duty with a valid permission grant covers this case sheet.');
    }
    return {
      assignmentId:          result.rows[0].assignment_id,
      dutyMemberId:          result.rows[0].duty_member_id,
      permissionSetVersionId: result.rows[0].permission_set_version_id,
    };
  }

  async getAllowedActionsForSnapshot(client: PoolClient, principal: Principal, snapshotId: string): Promise<SupervisorAction[]> {
    try {
      const assignmentId = await this.resolveAssignmentId(client, principal, snapshotId);
      return await this.permissionResolver.resolvePermissions(client, principal.organizationId, assignmentId);
    } catch (err) {
      // If no valid assignment or duty scope covers this case, they have no actions.
      return [];
    }
  }
}
