import type { PoolClient } from 'pg';
import { assertGroupMembership } from '@dentpilot/domain';
import type { Principal } from '../../security/auth.js';
import { ApiProblem } from '../../security/errors.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';

export class GroupsService {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly idempotency: IdempotencyService) {}
  async assignMembership(client: PoolClient, principal: Principal, input: { groupId:string; enrollmentId:string; departmentId:string; studentId:string; idempotencyKey:string; correlationId:string }): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'group-membership.assign',
      request: { groupId: input.groupId, enrollmentId: input.enrollmentId, departmentId: input.departmentId, studentId: input.studentId },
      responseStatus: 204,
      execute: async () => {
    const target=await client.query<{department_id:string;academic_year_id:string;academic_level_id:string;student_id:string;cohort_id:string}>('SELECT g.department_id,g.academic_year_id,g.academic_level_id,e.student_id,e.cohort_id FROM academic_groups g JOIN academic_enrollments e ON e.id=$2 AND e.status=\'ACTIVE\' WHERE g.id=$1 AND g.status=\'ACTIVE\'',[input.groupId,input.enrollmentId]);
    if (!target.rowCount || target.rows[0].department_id!==input.departmentId || target.rows[0].student_id!==input.studentId) throw new ApiProblem(404,'NOT_FOUND','Compatible group and enrollment context not found.');
    const context=target.rows[0];
    await this.authorization.assert(client,principal,'groups:manage',{departmentId:context.department_id,academicYearId:context.academic_year_id,academicLevelId:context.academic_level_id,cohortId:context.cohort_id,groupId:input.groupId});
    const policy=await client.query<{mode:'FULL_COHORT'|'GROUPS_ENABLED'}>('SELECT mode FROM department_distribution_policies WHERE department_id=$1 AND academic_year_id=$2 AND academic_level_id=$3',[context.department_id,context.academic_year_id,context.academic_level_id]);
    if (!policy.rowCount) throw new ApiProblem(404,'NOT_FOUND','Distribution policy not found.');
    const existing=await client.query('SELECT id FROM group_memberships WHERE enrollment_id=$1 AND department_id=$2 AND status=\'ACTIVE\' FOR UPDATE',[input.enrollmentId,context.department_id]);
    assertGroupMembership(policy.rows[0].mode,existing.rowCount ?? 0);
    if (existing.rowCount) await client.query("UPDATE group_memberships SET status='REMOVED',removed_at=now(),reason='Moved within department distribution' WHERE id=$1",[existing.rows[0].id]);
    await client.query('INSERT INTO group_memberships(organization_id,group_id,department_id,student_id,enrollment_id) VALUES($1,$2,$3,$4,$5)',[principal.organizationId,input.groupId,context.department_id,context.student_id,input.enrollmentId]);
    await this.audit.append(client,principal,{action:'GROUP_MEMBERSHIP_ASSIGNED',entityType:'group_membership',departmentId:context.department_id,correlationId:input.correlationId});
        return {};
      },
    });
  }
}
