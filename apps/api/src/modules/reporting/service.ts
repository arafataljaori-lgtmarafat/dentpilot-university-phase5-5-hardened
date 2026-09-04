import type { PoolClient } from 'pg';
import type { AggregateReportDto, DashboardReportDto, DepartmentReportRowDto, ScopedReportDto } from '@dentpilot/contracts';
import type { Principal } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';

interface DashboardCounts {
  total_students: string;
  total_submitted_cases: string;
  pending_clinical_decisions: string;
  graded_cases: string;
  active_supervisors: string;
}

export class ReportingService {
  constructor(private readonly authorization: AuthorizationService) {}

  private async departmentScope(client: PoolClient, principal: Principal, academicYearId: string, departmentId?: string): Promise<string[]|null> {
    await this.authorization.assert(client,principal,'reports:aggregate',{academicYearId,departmentId});
    if(principal.role==='UNIVERSITY_ADMIN') return departmentId?[departmentId]:null;
    const scoped=await client.query<{department_id:string}>(
      `SELECT DISTINCT department_id FROM account_scopes
       WHERE account_id=$1 AND department_id IS NOT NULL
         AND (academic_year_id IS NULL OR academic_year_id=$2)
         AND ($3::uuid IS NULL OR department_id=$3)`,
      [principal.accountId,academicYearId,departmentId??null],
    );
    return scoped.rows.map((row)=>row.department_id);
  }

  private async counts(client: PoolClient, academicYearId: string, departmentIds: string[]|null): Promise<DashboardCounts> {
    const result=await client.query<DashboardCounts>(
      `WITH student_counts AS (
         SELECT count(DISTINCT ae.student_id)::text AS value
         FROM academic_enrollments ae
         WHERE ae.academic_year_id=$1 AND ae.status='ACTIVE'
           AND ($2::uuid[] IS NULL OR EXISTS (
             SELECT 1 FROM roster_memberships rm JOIN rosters r ON r.id=rm.roster_id
             WHERE rm.enrollment_id=ae.id AND rm.status='ACTIVE' AND r.status='ACTIVE' AND r.department_id=ANY($2::uuid[])))
       ), latest_cases AS (
         SELECT cs.current_status
         FROM submission_snapshots ss JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id
         WHERE ss.academic_year_id=$1 AND ($2::uuid[] IS NULL OR ss.department_id=ANY($2::uuid[]))
       ), supervisor_counts AS (
         SELECT count(DISTINCT sa.supervisor_account_id)::text AS value
         FROM supervisor_assignments sa
         WHERE sa.academic_year_id=$1 AND sa.status='ACTIVE' AND sa.effective_from<=now()
           AND (sa.effective_to IS NULL OR sa.effective_to>now())
           AND ($2::uuid[] IS NULL OR sa.department_id=ANY($2::uuid[]))
       )
       SELECT (SELECT value FROM student_counts) AS total_students,
         count(*)::text AS total_submitted_cases,
         count(*) FILTER (WHERE current_status IN ('SUBMITTED','REVISION_REQUESTED'))::text AS pending_clinical_decisions,
         count(*) FILTER (WHERE current_status='GRADED')::text AS graded_cases,
         (SELECT value FROM supervisor_counts) AS active_supervisors
       FROM latest_cases`,
      [academicYearId,departmentIds],
    );
    return result.rows[0];
  }

  async aggregate(client: PoolClient, principal: Principal, academicYearId: string): Promise<AggregateReportDto> {
    const departmentIds=await this.departmentScope(client,principal,academicYearId);
    const counts=await this.counts(client,academicYearId,departmentIds);
    return {organizationId:principal.organizationId,academicYearId,totalStudents:Number(counts.total_students),totalSubmittedCases:Number(counts.total_submitted_cases),pendingClinicalDecisions:Number(counts.pending_clinical_decisions),generatedAt:new Date().toISOString()};
  }

  async dashboard(client: PoolClient, principal: Principal, academicYearId: string, departmentId?: string): Promise<DashboardReportDto> {
    const departmentIds=await this.departmentScope(client,principal,academicYearId,departmentId);
    const counts=await this.counts(client,academicYearId,departmentIds);
    return {organizationId:principal.organizationId,academicYearId,departmentId:departmentId??null,totalStudents:Number(counts.total_students),totalSubmittedCases:Number(counts.total_submitted_cases),pendingClinicalDecisions:Number(counts.pending_clinical_decisions),gradedCases:Number(counts.graded_cases),activeSupervisors:Number(counts.active_supervisors),generatedAt:new Date().toISOString()};
  }

  async scoped(client: PoolClient, principal: Principal, academicYearId: string, departmentId?: string): Promise<ScopedReportDto> {
    const departmentIds=await this.departmentScope(client,principal,academicYearId,departmentId);
    const rows=await client.query<{
      department_id:string;department_code:string;department_name:string;student_count:string;submitted_cases:string;
      pending_clinical_decisions:string;graded_cases:string;average_grade:string|null;
    }>(
      `WITH visible_departments AS (
         SELECT d.id,d.code,d.name FROM departments d
         WHERE d.active=true AND ($1::uuid[] IS NULL OR d.id=ANY($1::uuid[]))
       ), students_by_department AS (
         SELECT r.department_id,count(DISTINCT ae.student_id)::text AS student_count
         FROM academic_enrollments ae JOIN roster_memberships rm ON rm.enrollment_id=ae.id AND rm.status='ACTIVE'
         JOIN rosters r ON r.id=rm.roster_id AND r.status='ACTIVE'
         WHERE ae.academic_year_id=$2 AND ae.status='ACTIVE' GROUP BY r.department_id
       ), latest_cases AS (
         SELECT ss.id,ss.department_id,cs.current_status
         FROM submission_snapshots ss JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id
         WHERE ss.academic_year_id=$2
       ), latest_grades AS (
         SELECT DISTINCT ON (ge.snapshot_id) ge.snapshot_id,ge.new_grade
         FROM grade_events ge ORDER BY ge.snapshot_id,ge.created_at DESC,ge.id DESC
       ), case_counts AS (
         SELECT lc.department_id,count(*)::text AS submitted_cases,
           count(*) FILTER (WHERE lc.current_status IN ('SUBMITTED','REVISION_REQUESTED'))::text AS pending_clinical_decisions,
           count(*) FILTER (WHERE lc.current_status='GRADED')::text AS graded_cases,
           avg(lg.new_grade)::text AS average_grade
         FROM latest_cases lc LEFT JOIN latest_grades lg ON lg.snapshot_id=lc.id GROUP BY lc.department_id
       )
       SELECT vd.id AS department_id,vd.code AS department_code,vd.name AS department_name,
         COALESCE(sd.student_count,'0') AS student_count,COALESCE(cc.submitted_cases,'0') AS submitted_cases,
         COALESCE(cc.pending_clinical_decisions,'0') AS pending_clinical_decisions,COALESCE(cc.graded_cases,'0') AS graded_cases,
         cc.average_grade
       FROM visible_departments vd LEFT JOIN students_by_department sd ON sd.department_id=vd.id
       LEFT JOIN case_counts cc ON cc.department_id=vd.id ORDER BY vd.name,vd.id`,
      [departmentIds,academicYearId],
    );
    const mapped:DepartmentReportRowDto[]=rows.rows.map((row)=>({departmentId:row.department_id,departmentCode:row.department_code,departmentName:row.department_name,studentCount:Number(row.student_count),submittedCases:Number(row.submitted_cases),pendingClinicalDecisions:Number(row.pending_clinical_decisions),gradedCases:Number(row.graded_cases),averageGrade:row.average_grade===null?null:Number(row.average_grade)}));
    return {organizationId:principal.organizationId,academicYearId,departmentId:departmentId??null,rows:mapped,generatedAt:new Date().toISOString()};
  }
}
