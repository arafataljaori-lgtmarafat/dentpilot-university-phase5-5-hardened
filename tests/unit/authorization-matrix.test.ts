import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { AuthorizationService, type Permission } from '../../apps/api/src/security/authorization.js';
import type { Principal } from '../../apps/api/src/security/auth.js';

const permissions: Permission[] = ['students:read','rosters:manage','groups:manage','requirements:publish','cases:review','cases:grade','term-results:approve','term-results:lock','reports:aggregate','files:access','invitations:issue'];
const expected: Record<Principal['role'], Permission[]> = {
  UNIVERSITY_ADMIN: permissions,
  DEPARTMENT_ADMIN: ['students:read','rosters:manage','groups:manage','requirements:publish','reports:aggregate','files:access'],
  CLINICAL_SUPERVISOR: ['students:read','cases:review','cases:grade','files:access'],
  STUDENT_INTEGRATION: ['files:access'],
};
const departmentId='11111111-1111-4111-8111-111111111114';
const academicContext={departmentId,academicYearId:'11111111-1111-4111-8111-111111111115',academicLevelId:'11111111-1111-4111-8111-111111111117',cohortId:'11111111-1111-4111-8111-111111111118',groupId:'11111111-1111-4111-8111-111111111127',assignmentId:'11111111-1111-4111-8111-111111111128'};
const principal=(role:Principal['role']):Principal=>({accountId:'11111111-1111-4111-8111-111111111119',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role,departmentIds:[departmentId],studentId:role==='STUDENT_INTEGRATION'?'11111111-1111-4111-8111-111111111124':undefined});
const client={query:async()=>({rows:[{granted:true}],rowCount:1})} as unknown as PoolClient;

describe('central permission matrix',()=>{
  const authorization=new AuthorizationService();
  for(const role of Object.keys(expected) as Principal['role'][]) {
    for(const permission of permissions) {
      it(`${role} ${expected[role].includes(permission)?'allows':'denies'} ${permission}`,async()=>{
        const context=role==='CLINICAL_SUPERVISOR'&&permission==='cases:review'?{...academicContext,assignmentPermission:'reviewCases' as const}:role==='CLINICAL_SUPERVISOR'&&permission==='cases:grade'?{...academicContext,assignmentPermission:'grade' as const}:undefined;
        const operation=authorization.assert(client,principal(role),permission,context);
        if(expected[role].includes(permission)) await expect(operation).resolves.toBeUndefined();
        else await expect(operation).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
      });
    }
  }

  it('denies department mismatch',async()=>{
    const denied={query:async()=>({rows:[],rowCount:0})} as unknown as PoolClient;
    await expect(authorization.assert(denied,principal('DEPARTMENT_ADMIN'),'students:read',{departmentId:'22222222-2222-4222-8222-222222222222'})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('denies student ownership mismatch',async()=>{
    await expect(authorization.assert(client,principal('STUDENT_INTEGRATION'),'files:access',{studentId:'22222222-2222-4222-8222-222222222222'})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('denies inactive or ungranted supervisor assignment',async()=>{
    const denied={query:async(sql:string)=>sql.includes('account_scopes')?({rows:[{ok:1}],rowCount:1}):({rows:[],rowCount:0})} as unknown as PoolClient;
    await expect(authorization.assert(denied,principal('CLINICAL_SUPERVISOR'),'cases:review',{...academicContext,assignmentPermission:'reviewCases'})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  });

  it('restricts invitation issuance to university administrators',async()=>{
    await expect(authorization.assert(client,principal('DEPARTMENT_ADMIN'),'invitations:issue')).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
    await expect(authorization.assert(client,principal('UNIVERSITY_ADMIN'),'invitations:issue')).resolves.toBeUndefined();
  });

  // student-drafts:manage and student-submissions:read are deliberately NOT part of the
  // shared `permissions`/`expected` matrix above: that matrix's UNIVERSITY_ADMIN row is a
  // "holds every listed permission" shorthand, which is wrong for these two — they are
  // identity-scoped self-service capabilities keyed on principal.studentId, not an
  // administrative capability tier, so no staff role should ever hold them.
  it('restricts student draft and submission self-service to the owning student integration principal',async()=>{
    for(const permission of ['student-drafts:manage','student-submissions:read'] as const) {
      await expect(authorization.assert(client,principal('STUDENT_INTEGRATION'),permission,{studentId:principal('STUDENT_INTEGRATION').studentId})).resolves.toBeUndefined();
      for(const role of ['UNIVERSITY_ADMIN','DEPARTMENT_ADMIN','CLINICAL_SUPERVISOR'] as const) {
        await expect(authorization.assert(client,principal(role),permission)).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
      }
    }
  });
});
