import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { StudentDraftsService } from '../../apps/api/src/modules/drafts/service.js';
import { AuthorizationService } from '../../apps/api/src/security/authorization.js';
import type { Principal } from '../../apps/api/src/security/auth.js';
import type { IdempotencyService } from '../../apps/api/src/infrastructure/idempotency.js';
import type { AuditService } from '../../apps/api/src/modules/audit/service.js';

const student:Principal={accountId:'11111111-1111-4111-8111-111111111123',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role:'STUDENT_INTEGRATION',departmentIds:[],studentId:'11111111-1111-4111-8111-111111111124'};
const staff:Principal={...student,accountId:'11111111-1111-4111-8111-111111111119',role:'DEPARTMENT_ADMIN',studentId:undefined};
const enrollmentId='11111111-1111-4111-8111-111111111125';
const templateVersionId='11111111-1111-4111-8111-111111111133';
const termId='11111111-1111-4111-8111-111111111116';
const draftId='11111111-1111-4111-8111-111111111135';
const correlationId='11111111-1111-4111-8111-111111111197';
const idempotency={run:async(_client:unknown,_principal:unknown,command:{execute:()=>Promise<unknown>;responseStatus:number})=>({body:await command.execute(),responseStatus:command.responseStatus,replayed:false})} as unknown as IdempotencyService;
const audit={append:async()=>undefined} as unknown as AuditService;
const draftRow={id:draftId,student_id:student.studentId,enrollment_id:enrollmentId,term_id:termId,template_version_id:templateVersionId,payload:{procedure:'p'},revision:1,created_at:new Date('2026-01-01T00:00:00.000Z'),updated_at:new Date('2026-01-01T00:00:00.000Z')};

function service(): StudentDraftsService { return new StudentDraftsService(new AuthorizationService(),audit,idempotency); }

describe('StudentDraftsService.create',()=>{
  it('rejects a non-student-integration principal before touching the database',async()=>{
    const client={query:async()=>{throw new Error('must not query');}} as unknown as PoolClient;
    await expect(service().create(client,staff,{enrollmentId,templateVersionId,payload:{},idempotencyKey:'draft-create-0001',correlationId})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('rejects an enrollment that does not belong to the student',async()=>{
    const client={query:async()=>({rows:[{academic_year_id:'11111111-1111-4111-8111-111111111115',student_id:'22222222-2222-4222-8222-222222222222',status:'ACTIVE'}],rowCount:1})} as unknown as PoolClient;
    await expect(service().create(client,student,{enrollmentId,templateVersionId,payload:{},idempotencyKey:'draft-create-0002',correlationId})).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('rejects an unpublished template',async()=>{
    let call=0;
    const client={query:async()=>{call+=1; if(call===1) return {rows:[{academic_year_id:'11111111-1111-4111-8111-111111111115',student_id:student.studentId,status:'ACTIVE'}],rowCount:1}; return {rows:[],rowCount:0};}} as unknown as PoolClient;
    await expect(service().create(client,student,{enrollmentId,templateVersionId,payload:{},idempotencyKey:'draft-create-0003',correlationId})).rejects.toMatchObject({statusCode:409,code:'ILLEGAL_TRANSITION'});
  });

  it('creates a draft owned by the calling student once enrollment, template and an active term resolve',async()=>{
    let call=0;
    const client={query:async()=>{
      call+=1;
      if(call===1) return {rows:[{academic_year_id:'11111111-1111-4111-8111-111111111115',student_id:student.studentId,status:'ACTIVE'}],rowCount:1};
      if(call===2) return {rows:[{ok:1}],rowCount:1};
      if(call===3) return {rows:[{id:termId}],rowCount:1};
      return {rows:[draftRow],rowCount:1};
    }} as unknown as PoolClient;
    await expect(service().create(client,student,{enrollmentId,templateVersionId,payload:{procedure:'p'},idempotencyKey:'draft-create-0004',correlationId})).resolves.toEqual({
      id:draftId,enrollmentId,termId,templateVersionId,payload:{procedure:'p'},revision:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    });
  });
});

describe('StudentDraftsService.detail',()=>{
  it('hides a draft owned by a different student behind NOT_FOUND',async()=>{
    const client={query:async()=>({rows:[],rowCount:0})} as unknown as PoolClient;
    await expect(service().detail(client,student,draftId)).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('returns the owning student draft',async()=>{
    const client={query:async()=>({rows:[draftRow],rowCount:1})} as unknown as PoolClient;
    await expect(service().detail(client,student,draftId)).resolves.toMatchObject({id:draftId,revision:1});
  });
});

describe('StudentDraftsService.update',()=>{
  it('rejects a staff principal',async()=>{
    const client={query:async()=>{throw new Error('must not query');}} as unknown as PoolClient;
    await expect(service().update(client,staff,draftId,{payload:{},expectedRevision:1,idempotencyKey:'draft-update-0001',correlationId})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('rejects updating a draft owned by a different student',async()=>{
    const client={query:async()=>({rows:[],rowCount:0})} as unknown as PoolClient;
    await expect(service().update(client,student,draftId,{payload:{},expectedRevision:1,idempotencyKey:'draft-update-0002',correlationId})).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('rejects a stale revision instead of silently overwriting concurrent edits',async()=>{
    // assertOptimisticLock throws a plain DomainError (no statusCode) — the HTTP layer's
    // global error handler in app.ts is what maps DomainError('CONFLICT',...) to 409,
    // the same as every other optimistic-lock caller (students.closeEnrollment, results.transition).
    const client={query:async()=>({rows:[{student_id:student.studentId,revision:2}],rowCount:1})} as unknown as PoolClient;
    await expect(service().update(client,student,draftId,{payload:{},expectedRevision:1,idempotencyKey:'draft-update-0003',correlationId})).rejects.toMatchObject({code:'CONFLICT'});
  });

  it('applies the edit and increments the revision once the expected revision matches',async()=>{
    let call=0;
    const updated={...draftRow,payload:{procedure:'updated'},revision:2};
    const client={query:async()=>{call+=1; if(call===1) return {rows:[{student_id:student.studentId,revision:1}],rowCount:1}; return {rows:[updated],rowCount:1};}} as unknown as PoolClient;
    await expect(service().update(client,student,draftId,{payload:{procedure:'updated'},expectedRevision:1,idempotencyKey:'draft-update-0004',correlationId})).resolves.toMatchObject({revision:2,payload:{procedure:'updated'}});
  });
});
