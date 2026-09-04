import type { PoolClient } from 'pg';
import type { SupervisorAssignmentDto, SupervisorAssignmentListDto } from '@dentpilot/contracts';
import type { Principal } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';

export class AssignmentsService {
  constructor(private readonly authorization: AuthorizationService) {}

  async list(client: PoolClient, principal: Principal, filters: {departmentId?:string;academicYearId?:string;academicLevelId?:string;status?:string;page:number;pageSize:number}): Promise<SupervisorAssignmentListDto> {
    await this.authorization.assert(client,principal,'assignments:read',{departmentId:filters.departmentId,academicYearId:filters.academicYearId,academicLevelId:filters.academicLevelId});
    const result=await client.query<{
      id:string;supervisor_account_id:string;supervisor_display_name:string|null;department_id:string;academic_year_id:string;academic_level_id:string;
      cohort_id:string|null;group_id:string|null;status:SupervisorAssignmentDto['status'];effective_from:Date;effective_to:Date|null;revision:number;reason:string;
      review_cases:boolean;grade:boolean;total:string;
    }>(
      `WITH visible AS (
         SELECT sa.id,sa.supervisor_account_id,fp.display_name AS supervisor_display_name,sa.department_id,sa.academic_year_id,sa.academic_level_id,
           sa.cohort_id,sa.group_id,sa.status,sa.effective_from,sa.effective_to,sa.revision,sa.reason,
           COALESCE(bool_or(sap.granted) FILTER (WHERE sap.permission='reviewCases'),false) AS review_cases,
           COALESCE(bool_or(sap.granted) FILTER (WHERE sap.permission='grade'),false) AS grade
         FROM supervisor_assignments sa
         LEFT JOIN supervisor_assignment_permissions sap ON sap.assignment_id=sa.id
         LEFT JOIN faculty_profiles fp ON fp.account_id=sa.supervisor_account_id
         WHERE ($1::uuid IS NULL OR sa.department_id=$1)
           AND ($2::uuid IS NULL OR sa.academic_year_id=$2)
           AND ($3::uuid IS NULL OR sa.academic_level_id=$3)
           AND ($4::text IS NULL OR sa.status::text=$4)
           AND ($5='UNIVERSITY_ADMIN'
             OR ($5='CLINICAL_SUPERVISOR' AND sa.supervisor_account_id=$6)
             OR ($5='DEPARTMENT_ADMIN' AND EXISTS (SELECT 1 FROM account_scopes ac WHERE ac.account_id=$6 AND ac.department_id=sa.department_id AND (ac.academic_year_id IS NULL OR ac.academic_year_id=sa.academic_year_id) AND (ac.academic_level_id IS NULL OR ac.academic_level_id=sa.academic_level_id) AND (ac.cohort_id IS NULL OR ac.cohort_id=sa.cohort_id))))
         GROUP BY sa.id,fp.display_name
       ) SELECT *,count(*) OVER()::text AS total FROM visible ORDER BY effective_from DESC,id LIMIT $7 OFFSET $8`,
      [filters.departmentId??null,filters.academicYearId??null,filters.academicLevelId??null,filters.status??null,principal.role,principal.accountId,filters.pageSize,(filters.page-1)*filters.pageSize],
    );
    const items=result.rows.map((row):SupervisorAssignmentDto=>({id:row.id,supervisorAccountId:row.supervisor_account_id,supervisorDisplayName:row.supervisor_display_name,departmentId:row.department_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,groupId:row.group_id,status:row.status,effectiveFrom:row.effective_from.toISOString(),effectiveTo:row.effective_to?.toISOString()??null,revision:row.revision,reason:row.reason,permissions:{reviewCases:row.review_cases,grade:row.grade}}));
    const total=Number(result.rows[0]?.total??0);
    return {items,page:{page:filters.page,pageSize:filters.pageSize,total,totalPages:Math.ceil(total/filters.pageSize)}};
  }
}
