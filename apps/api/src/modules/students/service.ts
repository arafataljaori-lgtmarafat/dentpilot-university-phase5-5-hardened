import type { PoolClient } from 'pg';
import type { EnrollmentDetailDto, StudentDetailDto, StudentListDto, StudentListItemDto } from '@dentpilot/contracts';
import { assertOptimisticLock } from '@dentpilot/domain';
import type { Principal } from '../../security/auth.js';
import { ApiProblem } from '../../security/errors.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';

export class StudentsService {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly idempotency: IdempotencyService) {}
  async list(client: PoolClient, principal: Principal, filters: {departmentId?:string;academicYearId?:string;academicLevelId?:string;cohortId?:string;q?:string;page:number;pageSize:number}): Promise<StudentListDto> {
    await this.authorization.assert(client,principal,'students:read',{departmentId:filters.departmentId,academicYearId:filters.academicYearId,academicLevelId:filters.academicLevelId,cohortId:filters.cohortId});
    const result=await client.query<{
      id:string;student_number:string;display_name:string;status:StudentListItemDto['status'];revision:number;
      enrollment_id:string|null;academic_year_id:string|null;academic_level_id:string|null;cohort_id:string|null;
      enrollment_status:'ACTIVE'|null;started_at:Date|null;closed_at:Date|null;close_reason:string|null;enrollment_revision:number|null;
      department_ids:string[];total:string;
    }>(
      `WITH visible AS (
         SELECT s.id,s.student_number,s.display_name,s.status,s.revision,
           ae.id AS enrollment_id,ae.academic_year_id,ae.academic_level_id,ae.cohort_id,
           ae.status AS enrollment_status,ae.started_at,ae.closed_at,ae.close_reason,ae.revision AS enrollment_revision,
           COALESCE(array_agg(DISTINCT r.department_id) FILTER (WHERE r.department_id IS NOT NULL),'{}'::uuid[]) AS department_ids
         FROM students s
         LEFT JOIN academic_enrollments ae ON ae.student_id=s.id AND ae.status='ACTIVE'
         LEFT JOIN roster_memberships rm ON rm.enrollment_id=ae.id AND rm.status='ACTIVE'
         LEFT JOIN rosters r ON r.id=rm.roster_id AND r.status='ACTIVE'
         WHERE ($1::uuid IS NULL OR r.department_id=$1)
           AND ($2::uuid IS NULL OR ae.academic_year_id=$2)
           AND ($3::uuid IS NULL OR ae.academic_level_id=$3)
           AND ($4::uuid IS NULL OR ae.cohort_id=$4)
           AND ($5::text IS NULL OR s.display_name ILIKE '%'||$5||'%' OR s.student_number ILIKE '%'||$5||'%')
           AND (
             $6='UNIVERSITY_ADMIN'
             OR ($6='DEPARTMENT_ADMIN' AND EXISTS (
               SELECT 1 FROM account_scopes ac
               WHERE ac.account_id=$7 AND ac.department_id=r.department_id
                 AND (ac.academic_year_id IS NULL OR ac.academic_year_id=r.academic_year_id)
                 AND (ac.academic_level_id IS NULL OR ac.academic_level_id=r.academic_level_id)
                 AND (ac.cohort_id IS NULL OR ac.cohort_id=r.cohort_id)))
             OR ($6='CLINICAL_SUPERVISOR' AND EXISTS (
               SELECT 1 FROM supervisor_assignments sa
               WHERE sa.supervisor_account_id=$7 AND sa.department_id=r.department_id
                 AND sa.academic_year_id=r.academic_year_id AND sa.academic_level_id=r.academic_level_id
                 AND (sa.cohort_id IS NULL OR sa.cohort_id=r.cohort_id)
                 AND (sa.group_id IS NULL OR EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.enrollment_id=ae.id AND gm.department_id=r.department_id AND gm.group_id=sa.group_id AND gm.status='ACTIVE'))
                 AND sa.status='ACTIVE' AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())))
           )
         GROUP BY s.id,ae.id
       )
       SELECT *,count(*) OVER()::text AS total FROM visible
       ORDER BY display_name,id LIMIT $8 OFFSET $9`,
      [filters.departmentId??null,filters.academicYearId??null,filters.academicLevelId??null,filters.cohortId??null,filters.q?.trim()||null,principal.role,principal.accountId,filters.pageSize,(filters.page-1)*filters.pageSize],
    );
    const items=result.rows.map((row):StudentListItemDto=>({
      id:row.id,studentNumber:row.student_number,displayName:row.display_name,status:row.status,revision:row.revision,departmentIds:row.department_ids,
      activeEnrollment:row.enrollment_id&&row.academic_year_id&&row.academic_level_id&&row.cohort_id&&row.enrollment_status&&row.started_at&&row.enrollment_revision!==null?{
        id:row.enrollment_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,status:row.enrollment_status,
        startedAt:row.started_at.toISOString(),closedAt:row.closed_at?.toISOString()??null,closeReason:row.close_reason,revision:row.enrollment_revision,
      }:null,
    }));
    const total=Number(result.rows[0]?.total??0);
    return {items,page:{page:filters.page,pageSize:filters.pageSize,total,totalPages:Math.ceil(total/filters.pageSize)}};
  }

  async detail(client: PoolClient, principal: Principal, studentId: string): Promise<StudentDetailDto> {
    await this.authorization.assert(client,principal,'students:read');
    const identity=await client.query<{id:string;college_id:string;student_number:string;display_name:string;status:StudentDetailDto['status'];revision:number}>(
      `SELECT s.id,s.college_id,s.student_number,s.display_name,s.status,s.revision FROM students s WHERE s.id=$1 AND (
        $2='UNIVERSITY_ADMIN'
        OR ($2='DEPARTMENT_ADMIN' AND EXISTS (SELECT 1 FROM academic_enrollments ae JOIN roster_memberships rm ON rm.enrollment_id=ae.id JOIN rosters r ON r.id=rm.roster_id JOIN account_scopes ac ON ac.account_id=$3 AND ac.department_id=r.department_id AND (ac.academic_year_id IS NULL OR ac.academic_year_id=r.academic_year_id) AND (ac.academic_level_id IS NULL OR ac.academic_level_id=r.academic_level_id) AND (ac.cohort_id IS NULL OR ac.cohort_id=r.cohort_id) WHERE ae.student_id=s.id AND rm.status='ACTIVE' AND r.status='ACTIVE'))
        OR ($2='CLINICAL_SUPERVISOR' AND EXISTS (SELECT 1 FROM academic_enrollments ae JOIN roster_memberships rm ON rm.enrollment_id=ae.id JOIN rosters r ON r.id=rm.roster_id JOIN supervisor_assignments sa ON sa.supervisor_account_id=$3 AND sa.department_id=r.department_id AND sa.academic_year_id=r.academic_year_id AND sa.academic_level_id=r.academic_level_id AND (sa.cohort_id IS NULL OR sa.cohort_id=r.cohort_id) AND (sa.group_id IS NULL OR EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.enrollment_id=ae.id AND gm.department_id=r.department_id AND gm.group_id=sa.group_id AND gm.status='ACTIVE')) AND sa.status='ACTIVE' AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now()) WHERE ae.student_id=s.id AND rm.status='ACTIVE' AND r.status='ACTIVE'))
      )`,
      [studentId,principal.role,principal.accountId],
    );
    if(!identity.rowCount) throw new ApiProblem(404,'NOT_FOUND','Student not found.');
    const enrollments=await client.query<{id:string;academic_year_id:string;academic_level_id:string;cohort_id:string;status:EnrollmentDetailDto['status'];started_at:Date;closed_at:Date|null;close_reason:string|null;revision:number}>(
      `SELECT ae.id,ae.academic_year_id,ae.academic_level_id,ae.cohort_id,ae.status,ae.started_at,ae.closed_at,ae.close_reason,ae.revision
       FROM academic_enrollments ae WHERE ae.student_id=$1 AND (
         $2='UNIVERSITY_ADMIN'
         OR ($2='DEPARTMENT_ADMIN' AND EXISTS (
           SELECT 1 FROM roster_memberships rm JOIN rosters r ON r.id=rm.roster_id JOIN account_scopes ac ON ac.account_id=$3 AND ac.department_id=r.department_id
             AND (ac.academic_year_id IS NULL OR ac.academic_year_id=r.academic_year_id)
             AND (ac.academic_level_id IS NULL OR ac.academic_level_id=r.academic_level_id)
             AND (ac.cohort_id IS NULL OR ac.cohort_id=r.cohort_id)
           WHERE rm.enrollment_id=ae.id))
         OR ($2='CLINICAL_SUPERVISOR' AND EXISTS (
           SELECT 1 FROM roster_memberships rm JOIN rosters r ON r.id=rm.roster_id JOIN supervisor_assignments sa ON sa.supervisor_account_id=$3
             AND sa.department_id=r.department_id AND sa.academic_year_id=r.academic_year_id AND sa.academic_level_id=r.academic_level_id
             AND (sa.cohort_id IS NULL OR sa.cohort_id=r.cohort_id)
             AND (sa.group_id IS NULL OR EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.enrollment_id=ae.id AND gm.department_id=r.department_id AND gm.group_id=sa.group_id AND gm.status='ACTIVE'))
             AND sa.status='ACTIVE' AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())
           WHERE rm.enrollment_id=ae.id))
       ) ORDER BY ae.started_at DESC,ae.id`,[studentId,principal.role,principal.accountId],
    );
    const enrollmentDtos:EnrollmentDetailDto[]=[];
    for(const row of enrollments.rows){
      const rosters=await client.query<{id:string;roster_id:string;department_id:string;status:EnrollmentDetailDto['rosterMemberships'][number]['status'];added_at:Date;closed_at:Date|null;reason:string|null}>(
        `SELECT rm.id,rm.roster_id,r.department_id,rm.status,rm.added_at,rm.closed_at,rm.reason FROM roster_memberships rm JOIN rosters r ON r.id=rm.roster_id WHERE rm.enrollment_id=$1 AND ($2='UNIVERSITY_ADMIN' OR ($2='DEPARTMENT_ADMIN' AND EXISTS (SELECT 1 FROM account_scopes ac WHERE ac.account_id=$3 AND ac.department_id=r.department_id AND (ac.academic_year_id IS NULL OR ac.academic_year_id=r.academic_year_id) AND (ac.academic_level_id IS NULL OR ac.academic_level_id=r.academic_level_id) AND (ac.cohort_id IS NULL OR ac.cohort_id=r.cohort_id))) OR ($2='CLINICAL_SUPERVISOR' AND EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_account_id=$3 AND sa.department_id=r.department_id AND sa.academic_year_id=r.academic_year_id AND sa.academic_level_id=r.academic_level_id AND (sa.cohort_id IS NULL OR sa.cohort_id=r.cohort_id) AND (sa.group_id IS NULL OR EXISTS (SELECT 1 FROM group_memberships gm WHERE gm.enrollment_id=$1 AND gm.department_id=r.department_id AND gm.group_id=sa.group_id AND gm.status='ACTIVE')) AND sa.status='ACTIVE' AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())))) ORDER BY rm.added_at DESC`,[row.id,principal.role,principal.accountId]);
      const groups=await client.query<{id:string;group_id:string;department_id:string;status:EnrollmentDetailDto['groupMemberships'][number]['status'];assigned_at:Date;removed_at:Date|null;reason:string|null}>(
        `SELECT gm.id,gm.group_id,gm.department_id,gm.status,gm.assigned_at,gm.removed_at,gm.reason FROM group_memberships gm JOIN academic_groups ag ON ag.id=gm.group_id WHERE gm.enrollment_id=$1 AND ($2='UNIVERSITY_ADMIN' OR ($2='DEPARTMENT_ADMIN' AND EXISTS (SELECT 1 FROM account_scopes ac WHERE ac.account_id=$3 AND ac.department_id=gm.department_id AND (ac.academic_year_id IS NULL OR ac.academic_year_id=ag.academic_year_id) AND (ac.academic_level_id IS NULL OR ac.academic_level_id=ag.academic_level_id))) OR ($2='CLINICAL_SUPERVISOR' AND EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_account_id=$3 AND sa.department_id=gm.department_id AND sa.academic_year_id=ag.academic_year_id AND sa.academic_level_id=ag.academic_level_id AND (sa.group_id IS NULL OR sa.group_id=gm.group_id) AND sa.status='ACTIVE' AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())))) ORDER BY gm.assigned_at DESC`,[row.id,principal.role,principal.accountId]);
      enrollmentDtos.push({id:row.id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,status:row.status,startedAt:row.started_at.toISOString(),closedAt:row.closed_at?.toISOString()??null,closeReason:row.close_reason,revision:row.revision,rosterMemberships:rosters.rows.map((item)=>({id:item.id,rosterId:item.roster_id,departmentId:item.department_id,status:item.status,addedAt:item.added_at.toISOString(),closedAt:item.closed_at?.toISOString()??null,reason:item.reason})),groupMemberships:groups.rows.map((item)=>({id:item.id,groupId:item.group_id,departmentId:item.department_id,status:item.status,assignedAt:item.assigned_at.toISOString(),removedAt:item.removed_at?.toISOString()??null,reason:item.reason}))});
    }
    const row=identity.rows[0];
    return {id:row.id,collegeId:row.college_id,studentNumber:row.student_number,displayName:row.display_name,status:row.status,revision:row.revision,enrollments:enrollmentDtos};
  }
  async closeEnrollment(client: PoolClient, principal: Principal, enrollmentId: string, expectedRevision: number, reason: string, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'enrollment.close',
      request: { enrollmentId, expectedRevision, reason },
      responseStatus: 204,
      execute: async () => {
    const existing = await client.query<{revision:number; status:'ACTIVE'|'CLOSED'; student_id:string;academic_year_id:string;academic_level_id:string;cohort_id:string}>('SELECT revision,status,student_id,academic_year_id,academic_level_id,cohort_id FROM academic_enrollments WHERE id=$1 FOR UPDATE',[enrollmentId]);
    if (!existing.rowCount) throw new ApiProblem(404,'NOT_FOUND','Enrollment not found.');
    assertOptimisticLock(expectedRevision,existing.rows[0].revision); if (existing.rows[0].status !== 'ACTIVE') throw new ApiProblem(409,'ILLEGAL_TRANSITION','Enrollment is not active.');
    const rosters=await client.query<{department_id:string}>('SELECT r.department_id FROM roster_memberships rm JOIN rosters r ON r.id=rm.roster_id WHERE rm.enrollment_id=$1 AND rm.status=\'ACTIVE\' AND r.status=\'ACTIVE\' FOR UPDATE OF r',[enrollmentId]);
    if (principal.role!=='UNIVERSITY_ADMIN' && !rosters.rowCount) throw new ApiProblem(403,'FORBIDDEN','An enrollment without an active roster requires university authority.');
    for (const departmentId of new Set(rosters.rows.map((roster)=>roster.department_id))) await this.authorization.assert(client,principal,'rosters:manage',{departmentId,academicYearId:existing.rows[0].academic_year_id,academicLevelId:existing.rows[0].academic_level_id,cohortId:existing.rows[0].cohort_id});
    await client.query("UPDATE roster_memberships SET status='CLOSED',closed_at=now(),reason=$2 WHERE enrollment_id=$1 AND status='ACTIVE'",[enrollmentId,reason]);
    await client.query("UPDATE group_memberships SET status='CLOSED',removed_at=now(),reason=$2 WHERE enrollment_id=$1 AND status='ACTIVE'",[enrollmentId,reason]);
    await client.query("UPDATE academic_enrollments SET status='CLOSED',closed_at=now(),close_reason=$2,revision=revision+1 WHERE id=$1",[enrollmentId,reason]);
    await this.audit.append(client,principal,{action:'ENROLLMENT_CLOSED',entityType:'academic_enrollment',entityId:enrollmentId,correlationId,reason});
        return {};
      },
    });
  }
}
