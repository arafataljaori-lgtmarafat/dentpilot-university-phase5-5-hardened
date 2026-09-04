import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../apps/api/src/security/auth.js';
import type { Principal } from '../../apps/api/src/security/auth.js';
import type { Database } from '../../apps/api/src/infrastructure/db.js';

const admin:Principal={accountId:'11111111-1111-4111-8111-111111111119',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role:'UNIVERSITY_ADMIN',departmentIds:[]};
const studentId='11111111-1111-4111-8111-111111111124';
const correlationId='11111111-1111-4111-8111-111111111197';

interface RecordedCall { sql:string; params:unknown[]; }

function dbWithClient(client:PoolClient): Database {
  return {withTenant:async(_scope:unknown,operation:(client:PoolClient)=>Promise<unknown>)=>operation(client)} as unknown as Database;
}

function recordingClient(handlers:Record<string,()=>{rows:unknown[];rowCount:number}>): {client:PoolClient; calls:RecordedCall[]} {
  const calls:RecordedCall[]=[];
  const client={query:async(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    for(const [needle,handler] of Object.entries(handlers)) if(sql.includes(needle)) return handler();
    return {rows:[],rowCount:0};
  }} as unknown as PoolClient;
  return {client,calls};
}

describe('AuthService.issueInvitation',()=>{
  it('rejects a STUDENT_INTEGRATION invitation with no studentId before touching the database',async()=>{
    const service=new AuthService(dbWithClient({query:async()=>{throw new Error('must not query');}} as unknown as PoolClient),true);
    await expect(service.issueInvitation(admin,'new-student@dev.dentpilot.local','STUDENT_INTEGRATION',undefined,correlationId)).rejects.toMatchObject({statusCode:400,code:'VALIDATION_ERROR'});
  });

  it('rejects a non-student invitation that carries a studentId',async()=>{
    const service=new AuthService(dbWithClient({query:async()=>{throw new Error('must not query');}} as unknown as PoolClient),true);
    await expect(service.issueInvitation(admin,'new-admin@dev.dentpilot.local','DEPARTMENT_ADMIN',studentId,correlationId)).rejects.toMatchObject({statusCode:400,code:'VALIDATION_ERROR'});
  });

  it('rejects a studentId that does not resolve within the caller organization',async()=>{
    const {client}=recordingClient({'FROM students':()=>({rows:[],rowCount:0})});
    const service=new AuthService(dbWithClient(client),true);
    await expect(service.issueInvitation(admin,'new-student@dev.dentpilot.local','STUDENT_INTEGRATION',studentId,correlationId)).rejects.toMatchObject({statusCode:404,code:'NOT_FOUND'});
  });

  it('rejects a student already linked to an account instead of allowing a second link',async()=>{
    const {client}=recordingClient({'FROM students':()=>({rows:[{ok:1}],rowCount:1}),'FROM accounts WHERE student_id':()=>({rows:[{ok:1}],rowCount:1})});
    const service=new AuthService(dbWithClient(client),true);
    await expect(service.issueInvitation(admin,'new-student@dev.dentpilot.local','STUDENT_INTEGRATION',studentId,correlationId)).rejects.toMatchObject({statusCode:409,code:'CONFLICT'});
  });

  it('carries studentId into the invitation row for a valid, unlinked student',async()=>{
    const {client,calls}=recordingClient({'FROM students':()=>({rows:[{ok:1}],rowCount:1}),'FROM accounts WHERE student_id':()=>({rows:[],rowCount:0}),'INSERT INTO audit_events':()=>({rows:[{id:'11111111-1111-4111-8111-111111111199'}],rowCount:1})});
    const service=new AuthService(dbWithClient(client),true);
    await expect(service.issueInvitation(admin,'new-student@dev.dentpilot.local','STUDENT_INTEGRATION',studentId,correlationId)).resolves.toBeTruthy();
    const insert=calls.find((call)=>call.sql.includes('INSERT INTO invitations'));
    expect(insert?.params).toEqual([admin.organizationId,'new-student@dev.dentpilot.local','STUDENT_INTEGRATION',studentId,expect.any(String),admin.accountId]);
  });

  it('still issues a staff invitation with a null student_id, unchanged from before this sprint',async()=>{
    const {client,calls}=recordingClient({'INSERT INTO audit_events':()=>({rows:[{id:'11111111-1111-4111-8111-111111111199'}],rowCount:1})});
    const service=new AuthService(dbWithClient(client),true);
    await expect(service.issueInvitation(admin,'new-admin@dev.dentpilot.local','DEPARTMENT_ADMIN',undefined,correlationId)).resolves.toBeTruthy();
    const insert=calls.find((call)=>call.sql.includes('INSERT INTO invitations'));
    expect(insert?.params).toEqual([admin.organizationId,'new-admin@dev.dentpilot.local','DEPARTMENT_ADMIN',null,expect.any(String),admin.accountId]);
  });
});

describe('AuthService.redeemInvitation',()=>{
  it('copies the invitation student_id into the newly created account',async()=>{
    const {client,calls}=recordingClient({
      'FROM invitations i':()=>({rows:[{id:'11111111-1111-4111-8111-111111111160',email:'new-student@dev.dentpilot.local',role:'STUDENT_INTEGRATION',expires_at:new Date(Date.now()+3600_000),used_at:null,revoked_at:null,student_id:studentId,college_id:admin.collegeId}],rowCount:1}),
      'INSERT INTO audit_events':()=>({rows:[{id:'11111111-1111-4111-8111-111111111199'}],rowCount:1}),
    });
    const service=new AuthService(dbWithClient(client),true);
    await service.redeemInvitation(admin.organizationId,'a-token-value-that-is-long-enough','a-strong-development-password',correlationId);
    const insert=calls.find((call)=>call.sql.includes('INSERT INTO accounts'));
    expect(insert?.params).toEqual([admin.organizationId,admin.collegeId,'new-student@dev.dentpilot.local',expect.any(String),'ACTIVE','STUDENT_INTEGRATION',studentId]);
  });

  it('still inserts a null student_id for a non-student invitation',async()=>{
    const {client,calls}=recordingClient({
      'FROM invitations i':()=>({rows:[{id:'11111111-1111-4111-8111-111111111161',email:'new-admin@dev.dentpilot.local',role:'DEPARTMENT_ADMIN',expires_at:new Date(Date.now()+3600_000),used_at:null,revoked_at:null,student_id:null,college_id:admin.collegeId}],rowCount:1}),
      'INSERT INTO audit_events':()=>({rows:[{id:'11111111-1111-4111-8111-111111111199'}],rowCount:1}),
    });
    const service=new AuthService(dbWithClient(client),true);
    await service.redeemInvitation(admin.organizationId,'a-token-value-that-is-long-enough','a-strong-development-password',correlationId);
    const insert=calls.find((call)=>call.sql.includes('INSERT INTO accounts'));
    expect(insert?.params).toEqual([admin.organizationId,admin.collegeId,'new-admin@dev.dentpilot.local',expect.any(String),'ACTIVE','DEPARTMENT_ADMIN',null]);
  });
});
