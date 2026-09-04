import type { PoolClient } from 'pg';
import type { Principal } from './auth.js';
import { ApiProblem } from './errors.js';

export type Permission = 'catalogs:read' | 'students:read' | 'rosters:manage' | 'groups:read' | 'groups:manage' | 'assignments:read' | 'submissions:read' | 'requirements:publish' | 'cases:review' | 'cases:grade' | 'term-results:approve' | 'term-results:lock' | 'reports:aggregate' | 'files:access' | 'invitations:issue' | 'student-drafts:manage' | 'student-submissions:read';

export interface AuthorizationContext {
  departmentId?: string;
  academicYearId?: string;
  academicLevelId?: string;
  cohortId?: string;
  groupId?: string;
  assignmentId?: string;
  assignmentPermission?: 'reviewCases' | 'grade';
  studentId?: string;
}

const rolePermissions: Record<Principal['role'], readonly Permission[]> = {
  UNIVERSITY_ADMIN: ['catalogs:read','students:read','rosters:manage','groups:read','groups:manage','assignments:read','submissions:read','requirements:publish','cases:review','cases:grade','term-results:approve','term-results:lock','reports:aggregate','files:access','invitations:issue'],
  DEPARTMENT_ADMIN: ['catalogs:read','students:read','rosters:manage','groups:read','groups:manage','assignments:read','requirements:publish','reports:aggregate','files:access'],
  CLINICAL_SUPERVISOR: ['catalogs:read','students:read','groups:read','assignments:read','submissions:read','cases:review','cases:grade','files:access'],
  STUDENT_INTEGRATION: ['catalogs:read','files:access','student-drafts:manage','student-submissions:read'],
};

export class AuthorizationService {
  async assert(client: PoolClient, principal: Principal, permission: Permission, context: AuthorizationContext = {}): Promise<void> {
    if (!rolePermissions[principal.role].includes(permission)) throw new ApiProblem(403, 'FORBIDDEN', 'Permission denied.');
    if (principal.role === 'STUDENT_INTEGRATION' && context.studentId && context.studentId !== principal.studentId) throw new ApiProblem(403, 'FORBIDDEN', 'Student ownership denied.');

    if (principal.role !== 'UNIVERSITY_ADMIN' && (context.departmentId || context.academicYearId || context.academicLevelId || context.cohortId)) {
      const scope = await client.query(
        `SELECT 1 FROM account_scopes
         WHERE account_id=$1
           AND ($2::uuid IS NULL OR department_id=$2)
           AND ($3::uuid IS NULL OR academic_year_id IS NULL OR academic_year_id=$3)
           AND ($4::uuid IS NULL OR academic_level_id IS NULL OR academic_level_id=$4)
           AND ($5::uuid IS NULL OR cohort_id IS NULL OR cohort_id=$5)
         LIMIT 1`,
        [principal.accountId, context.departmentId ?? null, context.academicYearId ?? null, context.academicLevelId ?? null, context.cohortId ?? null],
      );
      if (!scope.rowCount) throw new ApiProblem(403, 'FORBIDDEN', 'Academic scope denied.');
    }

    if (principal.role === 'CLINICAL_SUPERVISOR' && (permission === 'cases:review' || permission === 'cases:grade')) {
      if (!context.assignmentId || !context.assignmentPermission || !context.departmentId || !context.academicYearId || !context.academicLevelId || !context.cohortId) {
        throw new ApiProblem(403, 'FORBIDDEN', 'Complete active assignment context is required.');
      }
      const assignment = await client.query<{granted:boolean}>(
        `SELECT sap.granted
         FROM supervisor_assignments sa
         JOIN supervisor_assignment_permissions sap ON sap.assignment_id=sa.id AND sap.organization_id=sa.organization_id
         WHERE sa.id=$1 AND sa.supervisor_account_id=$2 AND sa.status='ACTIVE'
           AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())
           AND sa.department_id=$3 AND sa.academic_year_id=$4 AND sa.academic_level_id=$5
           AND (sa.cohort_id IS NULL OR sa.cohort_id=$6)
           AND (sa.group_id IS NULL OR sa.group_id=$7)
           AND sap.permission=$8
         LIMIT 1`,
        [context.assignmentId,principal.accountId,context.departmentId,context.academicYearId,context.academicLevelId,context.cohortId,context.groupId ?? null,context.assignmentPermission],
      );
      if (assignment.rows[0]?.granted !== true) throw new ApiProblem(403, 'FORBIDDEN', 'Assignment permission denied.');
    }
  }
}
