import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { FilesService } from '../../apps/api/src/modules/files/service.js';
import { AuthorizationService } from '../../apps/api/src/security/authorization.js';
import type { Principal } from '../../apps/api/src/security/auth.js';
import type { IdempotencyService } from '../../apps/api/src/infrastructure/idempotency.js';
import type { ObjectStorage } from '../../apps/api/src/infrastructure/object-storage.js';
import type { AuditService } from '../../apps/api/src/modules/audit/service.js';

const owner:Principal={accountId:'11111111-1111-4111-8111-111111111119',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role:'DEPARTMENT_ADMIN',departmentIds:['11111111-1111-4111-8111-111111111114']};
const other={...owner,accountId:'11111111-1111-4111-8111-111111111120'};
const universityAdmin:Principal={...owner,accountId:'11111111-1111-4111-8111-111111111118',role:'UNIVERSITY_ADMIN',departmentIds:[]};
const student:Principal={...owner,accountId:'11111111-1111-4111-8111-111111111123',role:'STUDENT_INTEGRATION',studentId:'11111111-1111-4111-8111-111111111124'};
const storage={createObjectKey:()=>`${owner.organizationId}/opaque`,signedUpload:async()=>({url:'http://signed-upload',requiredHeaders:{}}),signedRead:async()=>('http://signed-read'),inspectObject:async()=>({contentType:'application/pdf',byteSize:10,sha256:'a'.repeat(64)})} as unknown as ObjectStorage;
const idempotency={run:async(_client:unknown,_principal:unknown,command:{execute:()=>Promise<unknown>;responseStatus:number})=>({body:await command.execute(),responseStatus:command.responseStatus,replayed:false})} as unknown as IdempotencyService;
const audit={append:async()=>undefined} as unknown as AuditService;
const correlationId='11111111-1111-4111-8111-111111111197';

describe('file object authorization',()=>{
  it('returns a file ID but never exposes a raw object key',async()=>{
    const client={query:async()=>({rows:[{id:'11111111-1111-4111-8111-111111111199'}],rowCount:1})} as unknown as PoolClient;
    const result=await new FilesService(new AuthorizationService(),idempotency,storage,audit).presignUpload(client,owner,{contentType:'application/pdf',byteSize:10,sha256:'a'.repeat(64),idempotencyKey:'file-test-key-0001'},correlationId);
    expect(result.fileId).toBeTruthy(); expect(result).not.toHaveProperty('objectKey');
  });

  it('allows the creating account to read its private file',async()=>{
    const client={query:async()=>({rows:[{object_key:`${owner.organizationId}/opaque`,created_by_account_id:owner.accountId,status:'UPLOADED',snapshot_id:null,department_id:null,supervisor_assignment_id:null}],rowCount:1})} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).presignRead(client,owner,'11111111-1111-4111-8111-111111111199')).resolves.toEqual({readUrl:'http://signed-read',expiresInSeconds:300});
  });

  it('hides an unattached private file from another tenant account',async()=>{
    const client={query:async()=>({rows:[{object_key:`${owner.organizationId}/opaque`,created_by_account_id:owner.accountId,status:'UPLOADED',snapshot_id:null,department_id:null,supervisor_assignment_id:null}],rowCount:1})} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).presignRead(client,other,'11111111-1111-4111-8111-111111111199')).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('does not let a university administrator read a private student draft attachment',async()=>{
    const client={query:async()=>({rows:[{object_key:`${owner.organizationId}/opaque`,created_by_account_id:student.accountId,status:'LINKED',snapshot_id:null,department_id:null,supervisor_assignment_id:null}],rowCount:1})} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).presignRead(client,universityAdmin,'11111111-1111-4111-8111-111111111199')).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('verifies uploaded bytes before completing the file lifecycle',async()=>{
    let query=0;
    const client={query:async()=>{
      query+=1;
      if(query===1) return {rows:[{id:'11111111-1111-4111-8111-111111111199',object_key:`${owner.organizationId}/opaque`,sha256:'a'.repeat(64),content_type:'application/pdf',byte_size:'10',created_by_account_id:owner.accountId,status:'PENDING_UPLOAD',completed_at:null}],rowCount:1};
      return {rows:[{completed_at:new Date('2026-01-01T00:00:00.000Z')}],rowCount:1};
    }} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).completeUpload(client,owner,'11111111-1111-4111-8111-111111111199','file-complete-key-0001',correlationId)).resolves.toEqual({fileId:'11111111-1111-4111-8111-111111111199',status:'UPLOADED',completedAt:'2026-01-01T00:00:00.000Z'});
  });

  it('rejects completion when object metadata does not match the authorized upload',async()=>{
    const mismatched={...storage,inspectObject:async()=>({contentType:'application/pdf',byteSize:11,sha256:'b'.repeat(64)})} as unknown as ObjectStorage;
    const client={query:async()=>({rows:[{id:'11111111-1111-4111-8111-111111111199',object_key:`${owner.organizationId}/opaque`,sha256:'a'.repeat(64),content_type:'application/pdf',byte_size:'10',created_by_account_id:owner.accountId,status:'PENDING_UPLOAD',completed_at:null}],rowCount:1})} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,mismatched,audit).completeUpload(client,owner,'11111111-1111-4111-8111-111111111199','file-mismatch-key-0001',correlationId)).rejects.toMatchObject({statusCode:409,code:'CONFLICT'});
  });

  it('links only a completed file to a draft owned by the student principal',async()=>{
    let query=0;
    const client={query:async()=>{
      query+=1;
      if(query===1) return {rows:[{id:'11111111-1111-4111-8111-111111111199',created_by_account_id:student.accountId,status:'UPLOADED'}],rowCount:1};
      if(query===2) return {rows:[{id:'11111111-1111-4111-8111-111111111135'}],rowCount:1};
      if(query===3) return {rows:[{id:'11111111-1111-4111-8111-111111111198'}],rowCount:1};
      return {rows:[],rowCount:1};
    }} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).linkToDraft(client,student,'11111111-1111-4111-8111-111111111199','11111111-1111-4111-8111-111111111135','file-link-key-0001',correlationId)).resolves.toEqual({attachmentId:'11111111-1111-4111-8111-111111111198',fileId:'11111111-1111-4111-8111-111111111199',draftId:'11111111-1111-4111-8111-111111111135'});
  });

  it('rejects draft attachment linking by a staff role',async()=>{
    const client={query:async()=>({rows:[],rowCount:0})} as unknown as PoolClient;
    await expect(new FilesService(new AuthorizationService(),idempotency,storage,audit).linkToDraft(client,owner,'11111111-1111-4111-8111-111111111199','11111111-1111-4111-8111-111111111135','file-link-deny-0001',correlationId)).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });
});
