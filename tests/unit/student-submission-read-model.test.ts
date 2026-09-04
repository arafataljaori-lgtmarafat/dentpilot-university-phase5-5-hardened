import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { CasesService } from '../../apps/api/src/modules/cases/service.js';
import { AuthorizationService } from '../../apps/api/src/security/authorization.js';
import type { Principal } from '../../apps/api/src/security/auth.js';
import type { IdempotencyService } from '../../apps/api/src/infrastructure/idempotency.js';
import type { AuditService } from '../../apps/api/src/modules/audit/service.js';

const student:Principal={accountId:'11111111-1111-4111-8111-111111111123',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role:'STUDENT_INTEGRATION',departmentIds:[],studentId:'11111111-1111-4111-8111-111111111124'};
const supervisor:Principal={...student,accountId:'11111111-1111-4111-8111-111111111121',role:'CLINICAL_SUPERVISOR',studentId:undefined};
const snapshotId='11111111-1111-4111-8111-111111111137';
const caseSheetId='11111111-1111-4111-8111-111111111136';
const policyId='11111111-1111-4111-8111-111111111132';
const idempotency={} as unknown as IdempotencyService;
const audit={append:async()=>undefined} as unknown as AuditService;
function service(): CasesService { return new CasesService(new AuthorizationService(),audit,idempotency); }

interface DetailFixture { decisions:unknown[]; notes:unknown[]; grade:unknown[]; policyVisible:boolean|null; }
function detailClient(fixture:DetailFixture, ownerStudentId=student.studentId): PoolClient {
  let call=0;
  return {query:async()=>{
    call+=1;
    if(call===1) return {rows:[{id:snapshotId,case_sheet_id:caseSheetId,student_id:ownerStudentId,status:'GRADED',sequence:1,submitted_at:new Date('2026-01-01T00:00:00.000Z'),payload:{procedure:'p'},workflow_policy_version_id:policyId}],rowCount:1};
    if(call===2) return {rows:fixture.decisions,rowCount:fixture.decisions.length};
    if(call===3) return {rows:fixture.notes,rowCount:fixture.notes.length};
    if(call===4) return {rows:fixture.grade,rowCount:fixture.grade.length};
    if(call===5) return {rows:[],rowCount:0}; // attachments
    return {rows:fixture.policyVisible===null?[]:[{visible:fixture.policyVisible}],rowCount:fixture.policyVisible===null?0:1}; // policy
  }} as unknown as PoolClient;
}

describe('CasesService.listForStudent',()=>{
  it('rejects a staff principal',async()=>{
    const client={query:async()=>{throw new Error('must not query');}} as unknown as PoolClient;
    await expect(service().listForStudent(client,supervisor,{page:1,pageSize:25})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('maps the owning student rows and only sets feedback when a headline reason or note exists',async()=>{
    const client={query:async()=>({rows:[
      {id:snapshotId,status:'SUBMITTED',submitted_at:new Date('2026-01-01T00:00:00.000Z'),feedback:null,total:'2'},
      {id:'11111111-1111-4111-8111-111111111138',status:'REVISION_REQUESTED',submitted_at:new Date('2026-01-02T00:00:00.000Z'),feedback:'Please redo the margins.',total:'2'},
    ],rowCount:2})} as unknown as PoolClient;
    await expect(service().listForStudent(client,student,{page:1,pageSize:25})).resolves.toEqual({
      items:[
        {snapshotId,status:'SUBMITTED',submittedAt:'2026-01-01T00:00:00.000Z'},
        {snapshotId:'11111111-1111-4111-8111-111111111138',status:'REVISION_REQUESTED',submittedAt:'2026-01-02T00:00:00.000Z',studentVisibleFeedback:'Please redo the margins.'},
      ],
      page:{page:1,pageSize:25,total:2,totalPages:1},
    });
  });
});

describe('CasesService.detailForStudent',()=>{
  it('rejects a staff principal before querying the snapshot',async()=>{
    const client={query:async()=>{throw new Error('must not query');}} as unknown as PoolClient;
    await expect(service().detailForStudent(client,supervisor,snapshotId)).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('hides a submission owned by a different student behind NOT_FOUND',async()=>{
    const client=detailClient({decisions:[],notes:[],grade:[],policyVisible:false},'22222222-2222-4222-8222-222222222222');
    await expect(service().detailForStudent(client,student,snapshotId)).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('hides the grade when the workflow policy does not mark it student-visible, even though a grade was recorded',async()=>{
    const client=detailClient({decisions:[],notes:[],grade:[{new_grade:'85.00',max_grade:'100.00',comment:'Solid work',created_at:new Date('2026-01-03T00:00:00.000Z')}],policyVisible:false});
    const result=await service().detailForStudent(client,student,snapshotId);
    expect(result.grade).toBeNull();
  });

  it('defaults to hidden when the workflow policy JSON has no studentGradeVisible key at all',async()=>{
    // Mirrors the COALESCE(...,false) default in the query — the same pattern already
    // used for grading_policy_versions.definition->>'maxGrade' in CasesService.grade().
    const client=detailClient({decisions:[],notes:[],grade:[{new_grade:'85.00',max_grade:'100.00',comment:'Solid work',created_at:new Date('2026-01-03T00:00:00.000Z')}],policyVisible:null});
    const result=await service().detailForStudent(client,student,snapshotId);
    expect(result.grade).toBeNull();
  });

  it('surfaces the current grade once the workflow policy marks it student-visible',async()=>{
    const client=detailClient({decisions:[],notes:[],grade:[{new_grade:'85.00',max_grade:'100.00',comment:'Solid work',created_at:new Date('2026-01-03T00:00:00.000Z')}],policyVisible:true});
    const result=await service().detailForStudent(client,student,snapshotId);
    expect(result.grade).toEqual({grade:85,maxGrade:100,comment:'Solid work',createdAt:'2026-01-03T00:00:00.000Z'});
  });

  it('never exposes department, assignment or policy-version identifiers in the student-facing shape',async()=>{
    const client=detailClient({decisions:[{decision_type:'REQUEST_REVISION',reason:'Fix the margins',created_at:new Date('2026-01-02T00:00:00.000Z')}],notes:[{id:'11111111-1111-4111-8111-111111111150',body:'Great progress',created_at:new Date('2026-01-02T12:00:00.000Z')}],grade:[],policyVisible:false});
    const result=await service().detailForStudent(client,student,snapshotId);
    expect(result).toEqual({
      snapshotId,caseSheetId,status:'GRADED',sequence:1,submittedAt:'2026-01-01T00:00:00.000Z',payload:{procedure:'p'},
      decisions:[{type:'REQUEST_REVISION',reason:'Fix the margins',createdAt:'2026-01-02T00:00:00.000Z'}],
      feedback:[{id:'11111111-1111-4111-8111-111111111150',body:'Great progress',createdAt:'2026-01-02T12:00:00.000Z'}],
      grade:null,attachments:[],
    });
  });
});
