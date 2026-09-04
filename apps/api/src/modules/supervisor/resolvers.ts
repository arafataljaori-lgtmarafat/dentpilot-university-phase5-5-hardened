import type { PoolClient } from 'pg';
import { ApiProblem } from '../../security/errors.js';
import type { SupervisorAction } from '@dentpilot/domain';

export class SupervisorDutyResolver {
  async resolveActiveDuty(client: PoolClient, organizationId: string, assignmentId: string): Promise<string> {
    const result = await client.query<{ shift_id: string }>(
      `SELECT cdm.shift_id
       FROM clinical_duty_members cdm
       JOIN clinical_duty_shifts cds ON cds.id = cdm.shift_id
       WHERE cdm.organization_id = $1
         AND cdm.assignment_id = $2
         AND cds.starts_at <= now()
         AND cds.ends_at >= now()
         AND cds.status = 'ACTIVE'`,
      [organizationId, assignmentId]
    );

    if (result.rowCount === 0) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Supervisor is not currently in an active duty shift.');
    }
    
    return result.rows[0].shift_id;
  }
}

export class SupervisorPermissionResolver {
  async resolvePermissions(client: PoolClient, organizationId: string, assignmentId: string): Promise<SupervisorAction[]> {
    const result = await client.query<{ permission: SupervisorAction }>(
      `SELECT spi.permission
       FROM supervisor_permission_grants spg
       JOIN supervisor_permission_set_items spi ON spi.version_id = spg.permission_set_version_id
       WHERE spg.organization_id = $1
         AND spg.assignment_id = $2
         AND spg.effective_from <= now()
         AND (spg.effective_to IS NULL OR spg.effective_to >= now())`,
      [organizationId, assignmentId]
    );
    
    return result.rows.map(r => r.permission);
  }
}

export class SupervisorScopeValidator {
  async validateScope(client: PoolClient, organizationId: string, assignmentId: string, snapshotId: string): Promise<void> {
    const result = await client.query<{ matched: boolean }>(
      `SELECT 1 AS matched
       FROM submission_snapshots ss
       JOIN supervisor_assignments sa ON sa.id = $2
       WHERE ss.organization_id = $1
         AND ss.id = $3
         AND sa.organization_id = $1
         AND sa.status = 'ACTIVE'
         AND ss.department_id = sa.department_id
         AND ss.academic_year_id = sa.academic_year_id
         AND ss.academic_level_id = sa.academic_level_id
         AND (sa.cohort_id IS NULL OR ss.cohort_id = sa.cohort_id)
         AND (sa.group_id IS NULL OR ss.group_id = sa.group_id)`,
      [organizationId, assignmentId, snapshotId]
    );

    if (result.rowCount === 0) {
      throw new ApiProblem(403, 'FORBIDDEN', "Case sheet is outside the supervisor's assigned scope.");
    }
  }
}
