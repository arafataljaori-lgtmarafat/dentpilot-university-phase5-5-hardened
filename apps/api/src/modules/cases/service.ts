import type { PoolClient } from 'pg';
import type { SubmissionDetailDto, SubmissionListDto, SubmissionListItemDto, StudentSubmissionDto, StudentSubmissionListDto, StudentSubmissionDetailDto } from '@dentpilot/contracts';
import { assertGradeAmendment, assertSubmissionTransition, type SubmissionStatus } from '@dentpilot/domain';
import type { Principal } from '../../security/auth.js';
import { ApiProblem } from '../../security/errors.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';

interface CurrentCase {
  snapshot_id: string;
  case_sheet_id: string;
  department_id: string;
  term_id: string;
  academic_year_id: string;
  academic_level_id: string;
  cohort_id: string;
  group_id: string|null;
  supervisor_assignment_id: string;
  grading_policy_version_id: string|null;
  current_status: SubmissionStatus;
}

export class CasesService {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly idempotency: IdempotencyService) {}

  async list(client:PoolClient,principal:Principal,filters:{departmentId?:string;academicYearId?:string;academicLevelId?:string;cohortId?:string;groupId?:string;status?:SubmissionListItemDto['status'];page:number;pageSize:number}):Promise<SubmissionListDto>{
    await this.authorization.assert(client,principal,'submissions:read',{departmentId:filters.departmentId,academicYearId:filters.academicYearId,academicLevelId:filters.academicLevelId,cohortId:filters.cohortId});
    const result=await client.query<{
      id:string;case_sheet_id:string;student_id:string;student_number:string;student_display_name:string;department_id:string;term_id:string;
      academic_year_id:string;academic_level_id:string;cohort_id:string;group_id:string|null;supervisor_assignment_id:string|null;
      status:SubmissionListItemDto['status'];sequence:number;submitted_at:Date;total:string;
    }>(
      `WITH visible AS (
         SELECT ss.id,ss.case_sheet_id,ss.student_id,s.student_number,s.display_name AS student_display_name,ss.department_id,ss.term_id,
           ss.academic_year_id,ss.academic_level_id,ss.cohort_id,ss.group_id,ss.supervisor_assignment_id,cs.current_status AS status,ss.sequence,ss.submitted_at
         FROM submission_snapshots ss
         JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id
         JOIN students s ON s.id=ss.student_id
         WHERE ($1::uuid IS NULL OR ss.department_id=$1) AND ($2::uuid IS NULL OR ss.academic_year_id=$2)
           AND ($3::uuid IS NULL OR ss.academic_level_id=$3) AND ($4::uuid IS NULL OR ss.cohort_id=$4)
           AND ($5::uuid IS NULL OR ss.group_id=$5) AND ($6::text IS NULL OR cs.current_status::text=$6)
           AND ($7='UNIVERSITY_ADMIN' OR ($7='CLINICAL_SUPERVISOR' AND EXISTS (
             SELECT 1 FROM supervisor_assignments sa JOIN supervisor_assignment_permissions sap ON sap.assignment_id=sa.id
             WHERE sa.id=ss.supervisor_assignment_id AND sa.supervisor_account_id=$8 AND sa.status='ACTIVE'
               AND sa.effective_from<=now() AND (sa.effective_to IS NULL OR sa.effective_to>now())
               AND sa.department_id=ss.department_id AND sa.academic_year_id=ss.academic_year_id AND sa.academic_level_id=ss.academic_level_id
               AND (sa.cohort_id IS NULL OR sa.cohort_id=ss.cohort_id) AND (sa.group_id IS NULL OR sa.group_id=ss.group_id)
               AND sap.permission='reviewCases' AND sap.granted=true)))
       ) SELECT *,count(*) OVER()::text AS total FROM visible ORDER BY submitted_at DESC,id LIMIT $9 OFFSET $10`,
      [filters.departmentId??null,filters.academicYearId??null,filters.academicLevelId??null,filters.cohortId??null,filters.groupId??null,filters.status??null,principal.role,principal.accountId,filters.pageSize,(filters.page-1)*filters.pageSize],
    );
    const items=result.rows.map((row):SubmissionListItemDto=>({id:row.id,caseSheetId:row.case_sheet_id,studentId:row.student_id,studentNumber:row.student_number,studentDisplayName:row.student_display_name,departmentId:row.department_id,termId:row.term_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,groupId:row.group_id,supervisorAssignmentId:row.supervisor_assignment_id,status:row.status,sequence:row.sequence,submittedAt:row.submitted_at.toISOString()}));
    const total=Number(result.rows[0]?.total??0);
    return {items,page:{page:filters.page,pageSize:filters.pageSize,total,totalPages:Math.ceil(total/filters.pageSize)}};
  }

  async detail(client:PoolClient,principal:Principal,snapshotId:string):Promise<SubmissionDetailDto>{
    const result=await client.query<{
      id:string;case_sheet_id:string;student_id:string;student_number:string;student_display_name:string;enrollment_id:string;department_id:string;term_id:string;
      academic_year_id:string;academic_level_id:string;cohort_id:string;group_id:string|null;supervisor_assignment_id:string|null;workflow_policy_version_id:string;
      requirement_set_version_id:string;requirement_id:string|null;template_version_id:string;grading_policy_version_id:string|null;payload:Record<string,unknown>;
      status:SubmissionDetailDto['status'];sequence:number;submitted_at:Date;
    }>(
      `SELECT ss.id,ss.case_sheet_id,ss.student_id,s.student_number,s.display_name AS student_display_name,ss.enrollment_id,ss.department_id,ss.term_id,
        ss.academic_year_id,ss.academic_level_id,ss.cohort_id,ss.group_id,ss.supervisor_assignment_id,ss.workflow_policy_version_id,
        ss.requirement_set_version_id,ss.requirement_id,ss.template_version_id,ss.grading_policy_version_id,ss.payload,
        cs.current_status AS status,ss.sequence,ss.submitted_at
       FROM submission_snapshots ss JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id JOIN students s ON s.id=ss.student_id
       WHERE ss.id=$1`,[snapshotId]);
    if(!result.rowCount) throw new ApiProblem(404,'NOT_FOUND','Submitted case not found.');
    const row=result.rows[0];
    await this.authorization.assert(client,principal,'cases:review',{departmentId:row.department_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,groupId:row.group_id??undefined,assignmentId:row.supervisor_assignment_id??undefined,assignmentPermission:'reviewCases'});
    const [revisions,decisions,grades,notes,attachments]=await Promise.all([
      client.query<{id:string;requested_by_account_id:string;reason:string;created_at:Date}>('SELECT id,requested_by_account_id,reason,created_at FROM revision_requests WHERE snapshot_id=$1 ORDER BY created_at,id',[snapshotId]),
      client.query<{id:string;decision_type:'APPROVE_START'|'APPROVE_FINAL'|'REQUEST_REVISION';decided_by_account_id:string;reason:string|null;created_at:Date}>('SELECT id,decision_type,decided_by_account_id,reason,created_at FROM clinical_decisions WHERE snapshot_id=$1 ORDER BY created_at,id',[snapshotId]),
      client.query<{id:string;action:'RECORDED'|'AMENDED';previous_grade:string|null;new_grade:string;max_grade:string;reason:string|null;comment:string;created_at:Date}>('SELECT id,action,previous_grade,new_grade,max_grade,reason,comment,created_at FROM grade_events WHERE snapshot_id=$1 ORDER BY created_at,id',[snapshotId]),
      client.query<{id:string;author_account_id:string;body:string;student_visible:boolean;created_at:Date}>('SELECT id,author_account_id,body,student_visible,created_at FROM supervisor_notes WHERE snapshot_id=$1 ORDER BY created_at,id',[snapshotId]),
      client.query<{id:string;file_object_id:string;content_type:string;byte_size:string;sha256:string;created_at:Date}>('SELECT a.id,a.file_object_id,f.content_type,f.byte_size::text,f.sha256,a.created_at FROM attachments a JOIN file_objects f ON f.id=a.file_object_id WHERE a.snapshot_id=$1 AND f.status=\'LINKED\' ORDER BY a.created_at,a.id',[snapshotId]),
    ]);
    return {id:row.id,caseSheetId:row.case_sheet_id,studentId:row.student_id,studentNumber:row.student_number,studentDisplayName:row.student_display_name,enrollmentId:row.enrollment_id,departmentId:row.department_id,termId:row.term_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id,groupId:row.group_id,supervisorAssignmentId:row.supervisor_assignment_id,status:row.status,sequence:row.sequence,submittedAt:row.submitted_at.toISOString(),workflowPolicyVersionId:row.workflow_policy_version_id,requirementSetVersionId:row.requirement_set_version_id,requirementId:row.requirement_id,templateVersionId:row.template_version_id,gradingPolicyVersionId:row.grading_policy_version_id,payload:row.payload,revisions:revisions.rows.map((item)=>({id:item.id,requestedByAccountId:item.requested_by_account_id,reason:item.reason,createdAt:item.created_at.toISOString()})),decisions:decisions.rows.map((item)=>({id:item.id,type:item.decision_type,decidedByAccountId:item.decided_by_account_id,reason:item.reason,createdAt:item.created_at.toISOString()})),grades:grades.rows.map((item)=>({id:item.id,action:item.action,previousGrade:item.previous_grade===null?null:Number(item.previous_grade),newGrade:Number(item.new_grade),maxGrade:Number(item.max_grade),reason:item.reason,comment:item.comment,createdAt:item.created_at.toISOString()})),supervisorNotes:notes.rows.map((item)=>({id:item.id,authorAccountId:item.author_account_id,body:item.body,studentVisible:item.student_visible,createdAt:item.created_at.toISOString()})),attachments:attachments.rows.map((item)=>({id:item.id,fileId:item.file_object_id,contentType:item.content_type,byteSize:Number(item.byte_size),sha256:item.sha256,createdAt:item.created_at.toISOString()}))};
  }

  // Student-scoped read model: distinct from list()/detail() above, which are the
  // staff views gated by 'submissions:read'/'cases:review' and scoped by
  // department/assignment. These are gated by the separate 'student-submissions:read'
  // permission granted only to STUDENT_INTEGRATION, filtered exclusively by
  // ss.student_id=principal.studentId (never by department/assignment scope, since a
  // student has no account_scopes), and shaped to hide internal supervisor notes,
  // policy/assignment ids, and full grade-amendment history — see detailForStudent.
  async listForStudent(client:PoolClient,principal:Principal,filters:{page:number;pageSize:number}):Promise<StudentSubmissionListDto>{
    if (principal.role!=='STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403,'FORBIDDEN','Only a student integration principal can list their submissions.');
    await this.authorization.assert(client,principal,'student-submissions:read',{studentId:principal.studentId});
    const result=await client.query<{id:string;status:SubmissionListItemDto['status'];submitted_at:Date;feedback:string|null;total:string}>(
      `WITH visible AS (
         SELECT ss.id,cs.current_status AS status,ss.submitted_at,
           COALESCE(
             (SELECT reason FROM clinical_decisions WHERE snapshot_id=ss.id AND decision_type='REQUEST_REVISION' ORDER BY created_at DESC LIMIT 1),
             (SELECT body FROM supervisor_notes WHERE snapshot_id=ss.id AND student_visible=true ORDER BY created_at DESC LIMIT 1)
           ) AS feedback
         FROM submission_snapshots ss
         JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id
         WHERE ss.student_id=$1
       ) SELECT *,count(*) OVER()::text AS total FROM visible ORDER BY submitted_at DESC,id LIMIT $2 OFFSET $3`,
      [principal.studentId,filters.pageSize,(filters.page-1)*filters.pageSize],
    );
    const items=result.rows.map((row):StudentSubmissionDto=>({snapshotId:row.id,status:row.status,submittedAt:row.submitted_at.toISOString(),...(row.feedback?{studentVisibleFeedback:row.feedback}:{})}));
    const total=Number(result.rows[0]?.total??0);
    return {items,page:{page:filters.page,pageSize:filters.pageSize,total,totalPages:Math.ceil(total/filters.pageSize)}};
  }

  async detailForStudent(client:PoolClient,principal:Principal,snapshotId:string):Promise<StudentSubmissionDetailDto>{
    if (principal.role!=='STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403,'FORBIDDEN','Only a student integration principal can read their submission.');
    await this.authorization.assert(client,principal,'student-submissions:read',{studentId:principal.studentId});
    const result=await client.query<{id:string;case_sheet_id:string;student_id:string;status:SubmissionListItemDto['status'];sequence:number;submitted_at:Date;payload:Record<string,unknown>;workflow_policy_version_id:string}>(
      `SELECT ss.id,ss.case_sheet_id,ss.student_id,cs.current_status AS status,ss.sequence,ss.submitted_at,ss.payload,ss.workflow_policy_version_id
       FROM submission_snapshots ss JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id WHERE ss.id=$1`,
      [snapshotId],
    );
    if (!result.rowCount || result.rows[0].student_id!==principal.studentId) throw new ApiProblem(404,'NOT_FOUND','Submission not found.');
    const row=result.rows[0];
    const [decisions,notes,grade,attachments,policy]=await Promise.all([
      client.query<{decision_type:'APPROVE_START'|'APPROVE_FINAL'|'REQUEST_REVISION';reason:string|null;created_at:Date}>('SELECT decision_type,reason,created_at FROM clinical_decisions WHERE snapshot_id=$1 ORDER BY created_at,id',[snapshotId]),
      client.query<{id:string;body:string;created_at:Date}>('SELECT id,body,created_at FROM supervisor_notes WHERE snapshot_id=$1 AND student_visible=true ORDER BY created_at,id',[snapshotId]),
      client.query<{new_grade:string;max_grade:string;comment:string;created_at:Date}>('SELECT new_grade,max_grade,comment,created_at FROM grade_events WHERE snapshot_id=$1 ORDER BY created_at DESC LIMIT 1',[snapshotId]),
      client.query<{id:string;file_object_id:string;content_type:string;byte_size:string;sha256:string;created_at:Date}>('SELECT a.id,a.file_object_id,f.content_type,f.byte_size::text,f.sha256,a.created_at FROM attachments a JOIN file_objects f ON f.id=a.file_object_id WHERE a.snapshot_id=$1 AND f.status=\'LINKED\' ORDER BY a.created_at,a.id',[snapshotId]),
      client.query<{visible:boolean}>("SELECT COALESCE((definition->>'studentGradeVisible')::boolean,false) AS visible FROM clinical_workflow_policy_versions WHERE id=$1",[row.workflow_policy_version_id]),
    ]);
    const gradeVisible=policy.rows[0]?.visible===true;
    return {
      snapshotId:row.id,caseSheetId:row.case_sheet_id,status:row.status,sequence:row.sequence,submittedAt:row.submitted_at.toISOString(),payload:row.payload,
      decisions:decisions.rows.map((item)=>({type:item.decision_type,reason:item.reason,createdAt:item.created_at.toISOString()})),
      feedback:notes.rows.map((item)=>({id:item.id,body:item.body,createdAt:item.created_at.toISOString()})),
      grade:gradeVisible&&grade.rowCount?{grade:Number(grade.rows[0].new_grade),maxGrade:Number(grade.rows[0].max_grade),comment:grade.rows[0].comment,createdAt:grade.rows[0].created_at.toISOString()}:null,
      attachments:attachments.rows.map((item)=>({id:item.id,fileId:item.file_object_id,contentType:item.content_type,byteSize:Number(item.byte_size),sha256:item.sha256,createdAt:item.created_at.toISOString()})),
    };
  }

  async submitDraft(client: PoolClient, principal: Principal, input: { draftId:string; idempotencyKey:string; correlationId:string }): Promise<{snapshotId:string}> {
    if (principal.role!=='STUDENT_INTEGRATION' || !principal.studentId) throw new ApiProblem(403,'FORBIDDEN','Only a student integration principal can submit a draft.');
    const result = await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'case.submit-draft',
      request: { draftId: input.draftId },
      responseStatus: 201,
      execute: async () => {
        const draft=await client.query<{id:string;student_id:string;enrollment_id:string;term_id:string;template_version_id:string;payload:Record<string,unknown>}>('SELECT id,student_id,enrollment_id,term_id,template_version_id,payload FROM student_drafts WHERE id=$1 FOR UPDATE',[input.draftId]);
        if (!draft.rowCount || draft.rows[0].student_id!==principal.studentId) throw new ApiProblem(404,'NOT_FOUND','Draft not found.');
        const d=draft.rows[0];
        const enrollment=await client.query<{academic_year_id:string;academic_level_id:string;cohort_id:string;student_id:string}>('SELECT academic_year_id,academic_level_id,cohort_id,student_id FROM academic_enrollments WHERE id=$1 AND status=\'ACTIVE\'',[d.enrollment_id]);
        if(!enrollment.rowCount || enrollment.rows[0].student_id!==d.student_id) throw new ApiProblem(409,'ILLEGAL_TRANSITION','Draft enrollment is not active or does not belong to the student.');
        const academic=enrollment.rows[0];
        const term=await client.query('SELECT 1 FROM terms WHERE id=$1 AND academic_year_id=$2 AND status=\'ACTIVE\'',[d.term_id,academic.academic_year_id]);
        if(!term.rowCount) throw new ApiProblem(409,'ILLEGAL_TRANSITION','Draft term is not active in the enrollment academic year.');
        const template=await client.query<{department_id:string}>('SELECT department_id FROM case_sheet_template_versions WHERE id=$1 AND status=\'PUBLISHED\'',[d.template_version_id]);
        if(!template.rowCount) throw new ApiProblem(409,'ILLEGAL_TRANSITION','Template is not published.');
        const departmentId=template.rows[0].department_id;
        const membership=await client.query<{group_id:string}>('SELECT group_id FROM group_memberships WHERE enrollment_id=$1 AND department_id=$2 AND status=\'ACTIVE\'',[d.enrollment_id,departmentId]);
        const groupId=membership.rows[0]?.group_id ?? null;
        await this.assertTermUnlocked(client,{department_id:departmentId,term_id:d.term_id,academic_level_id:academic.academic_level_id,cohort_id:academic.cohort_id});
        const policy=await client.query<{id:string}>('SELECT id FROM clinical_workflow_policy_versions WHERE department_id=$1 AND status=\'PUBLISHED\' ORDER BY version_number DESC LIMIT 1',[departmentId]);
        const req=await client.query<{id:string}>('SELECT rsv.id FROM requirement_sets rs JOIN requirement_set_versions rsv ON rsv.requirement_set_id=rs.id WHERE rs.department_id=$1 AND rs.academic_year_id=$2 AND rs.academic_level_id=$3 AND rsv.status=\'PUBLISHED\' ORDER BY rsv.version_number DESC LIMIT 1',[departmentId,academic.academic_year_id,academic.academic_level_id]);
        const grading=await client.query<{id:string}>('SELECT id FROM grading_policy_versions WHERE department_id=$1 AND status=\'PUBLISHED\' ORDER BY version_number DESC LIMIT 1',[departmentId]);
        const assignment=await client.query<{id:string}>('SELECT id FROM supervisor_assignments WHERE department_id=$1 AND academic_year_id=$2 AND academic_level_id=$3 AND status=\'ACTIVE\' AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) AND (cohort_id IS NULL OR cohort_id=$4) AND (group_id IS NULL OR group_id=$5) ORDER BY (group_id IS NOT NULL) DESC,(cohort_id IS NOT NULL) DESC,effective_from DESC LIMIT 1',[departmentId,academic.academic_year_id,academic.academic_level_id,academic.cohort_id,groupId]);
        if(!policy.rowCount||!req.rowCount||!grading.rowCount||!assignment.rowCount) throw new ApiProblem(409,'ILLEGAL_TRANSITION','No effective policy or supervisor assignment exists for the complete academic context.');
        const linkedFiles=await client.query<{file_id:string;content_type:string;byte_size:string;sha256:string}>('SELECT f.id AS file_id,f.content_type,f.byte_size::text,f.sha256 FROM attachments a JOIN file_objects f ON f.id=a.file_object_id WHERE a.draft_id=$1 AND f.status=\'LINKED\' ORDER BY a.created_at,a.id',[d.id]);
        const attachmentSnapshot=linkedFiles.rows.map((file)=>({fileId:file.file_id,contentType:file.content_type,byteSize:Number(file.byte_size),sha256:file.sha256}));
        const caseSheet=await client.query<{id:string}>('INSERT INTO case_sheets(organization_id,student_id,enrollment_id,department_id,term_id,current_status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[principal.organizationId,d.student_id,d.enrollment_id,departmentId,d.term_id,'SUBMITTED']);
        const snapshot=await client.query<{id:string}>('INSERT INTO submission_snapshots(organization_id,case_sheet_id,student_id,enrollment_id,department_id,term_id,academic_year_id,academic_level_id,cohort_id,group_id,supervisor_assignment_id,workflow_policy_version_id,requirement_set_version_id,template_version_id,grading_policy_version_id,payload,attachment_snapshot,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,1) RETURNING id',[principal.organizationId,caseSheet.rows[0].id,d.student_id,d.enrollment_id,departmentId,d.term_id,academic.academic_year_id,academic.academic_level_id,academic.cohort_id,groupId,assignment.rows[0].id,policy.rows[0].id,req.rows[0].id,d.template_version_id,grading.rows[0].id,d.payload,JSON.stringify(attachmentSnapshot)]);
        await client.query('UPDATE case_sheets SET latest_snapshot_id=$1 WHERE id=$2',[snapshot.rows[0].id,caseSheet.rows[0].id]);
        await client.query('UPDATE attachments SET snapshot_id=$2,draft_id=NULL WHERE draft_id=$1',[d.id,snapshot.rows[0].id]);
        await client.query('DELETE FROM student_drafts WHERE id=$1',[d.id]);
        await this.audit.append(client,principal,{action:'CASE_SUBMITTED',entityType:'submission_snapshot',entityId:snapshot.rows[0].id,departmentId,correlationId:input.correlationId});
        return {snapshotId:snapshot.rows[0].id};
      },
    });
    return result.body;
  }

  async approve(client: PoolClient, principal: Principal, snapshotId:string, target:'APPROVED_START'|'APPROVED_FINAL', idempotencyKey:string, correlationId:string): Promise<void> {
    await this.idempotency.run(client,principal,{
      key:idempotencyKey,
      operation:`case.${target.toLowerCase()}`,
      request:{snapshotId,target},
      responseStatus:204,
      execute:async()=>{
        const current=await this.loadCurrent(client,snapshotId);
        await this.authorizeCase(client,principal,current,'reviewCases');
        await this.assertTermUnlocked(client,current);
        assertSubmissionTransition(current.current_status,target);
        await client.query('INSERT INTO clinical_decisions(organization_id,snapshot_id,decision_type,decided_by_account_id) VALUES($1,$2,$3,$4)',[principal.organizationId,snapshotId,target==='APPROVED_START'?'APPROVE_START':'APPROVE_FINAL',principal.accountId]);
        await client.query('UPDATE case_sheets SET current_status=$2::submission_status,revision=revision+1 WHERE id=$1',[current.case_sheet_id,target]);
        await this.audit.append(client,principal,{action:target,entityType:'submission_snapshot',entityId:snapshotId,departmentId:current.department_id,correlationId});
        return {};
      },
    });
  }

  async grade(client: PoolClient, principal: Principal, input: { snapshotId:string; grade:number; comment:string; reason?:string; idempotencyKey:string; correlationId:string }): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'case.grade',
      request: { snapshotId: input.snapshotId, grade: input.grade, comment: input.comment, reason: input.reason },
      responseStatus: 204,
      execute: async () => {
        const current=await this.loadCurrent(client,input.snapshotId);
        await this.authorizeCase(client,principal,current,'grade');
        await this.assertTermUnlocked(client,current);
        const prior=await client.query<{new_grade:string}>('SELECT new_grade FROM grade_events WHERE snapshot_id=$1 ORDER BY created_at DESC LIMIT 1',[current.snapshot_id]);
        if(prior.rowCount) {
          if(current.current_status!=='GRADED') throw new ApiProblem(409,'ILLEGAL_TRANSITION','A grade amendment requires the case to remain graded.');
          assertGradeAmendment(input.reason);
        } else {
          assertSubmissionTransition(current.current_status,'GRADED');
        }
        const policy=await client.query<{max_grade:string}>('SELECT COALESCE((definition->>\'maxGrade\')::numeric,100)::text AS max_grade FROM grading_policy_versions WHERE id=$1',[current.grading_policy_version_id]);
        const maxGrade=Number(policy.rows[0]?.max_grade ?? 100);
        if(input.grade>maxGrade) throw new ApiProblem(400,'VALIDATION_ERROR','Grade exceeds the snapshotted grading policy maximum.');
        await client.query('INSERT INTO grade_events(organization_id,snapshot_id,actor_account_id,action,previous_grade,new_grade,max_grade,reason,comment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[principal.organizationId,current.snapshot_id,principal.accountId,prior.rowCount?'AMENDED':'RECORDED',prior.rows[0]?.new_grade??null,input.grade,maxGrade,input.reason??null,input.comment]);
        if(!prior.rowCount) await client.query("UPDATE case_sheets SET current_status='GRADED',revision=revision+1 WHERE id=$1",[current.case_sheet_id]);
        await this.audit.append(client,principal,{action:prior.rowCount?'GRADE_AMENDED':'GRADE_RECORDED',entityType:'submission_snapshot',entityId:current.snapshot_id,departmentId:current.department_id,correlationId:input.correlationId,reason:input.reason});
        return {};
      },
    });
  }

  async requestRevision(client: PoolClient, principal: Principal, snapshotId:string, reason:string, idempotencyKey:string, correlationId:string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: 'case.request-revision',
      request: { snapshotId, reason },
      responseStatus: 204,
      execute: async () => {
        const current=await this.loadCurrent(client,snapshotId);
        await this.authorizeCase(client,principal,current,'reviewCases');
        await this.assertTermUnlocked(client,current);
        assertSubmissionTransition(current.current_status,'REVISION_REQUESTED');
        await client.query('INSERT INTO revision_requests(organization_id,snapshot_id,requested_by_account_id,reason) VALUES($1,$2,$3,$4)',[principal.organizationId,snapshotId,principal.accountId,reason]);
        await client.query('INSERT INTO clinical_decisions(organization_id,snapshot_id,decision_type,decided_by_account_id,reason) VALUES($1,$2,\'REQUEST_REVISION\',$3,$4)',[principal.organizationId,snapshotId,principal.accountId,reason]);
        await client.query("UPDATE case_sheets SET current_status='REVISION_REQUESTED',revision=revision+1 WHERE id=$1",[current.case_sheet_id]);
        await this.audit.append(client,principal,{action:'REVISION_REQUESTED',entityType:'submission_snapshot',entityId:snapshotId,departmentId:current.department_id,correlationId,reason});
        return {};
      },
    });
  }

  private async loadCurrent(client:PoolClient,snapshotId:string):Promise<CurrentCase> {
    const result=await client.query<CurrentCase>('SELECT ss.id AS snapshot_id,ss.case_sheet_id,ss.department_id,ss.term_id,ss.academic_year_id,ss.academic_level_id,ss.cohort_id,ss.group_id,ss.supervisor_assignment_id,ss.grading_policy_version_id,cs.current_status FROM submission_snapshots ss JOIN case_sheets cs ON cs.id=ss.case_sheet_id AND cs.latest_snapshot_id=ss.id WHERE ss.id=$1 FOR UPDATE OF cs',[snapshotId]);
    if(!result.rowCount) throw new ApiProblem(404,'NOT_FOUND','Current submission not found.');
    return result.rows[0];
  }

  private async authorizeCase(client:PoolClient,principal:Principal,current:CurrentCase,permission:'reviewCases'|'grade'):Promise<void> {
    await this.authorization.assert(client,principal,permission==='grade'?'cases:grade':'cases:review',{
      departmentId:current.department_id,
      academicYearId:current.academic_year_id,
      academicLevelId:current.academic_level_id,
      cohortId:current.cohort_id,
      groupId:current.group_id ?? undefined,
      assignmentId:current.supervisor_assignment_id,
      assignmentPermission:permission,
    });
  }

  private async assertTermUnlocked(client:PoolClient,context:{department_id:string;term_id:string;academic_level_id:string;cohort_id:string}):Promise<void> {
    const locked=await client.query('SELECT 1 FROM term_result_closures WHERE department_id=$1 AND term_id=$2 AND academic_level_id=$3 AND cohort_id=$4 AND status=\'LOCKED\'',[context.department_id,context.term_id,context.academic_level_id,context.cohort_id]);
    if(locked.rowCount) throw new ApiProblem(409,'ILLEGAL_TRANSITION','The academic term result is locked.');
  }
}
