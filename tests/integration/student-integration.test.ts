import crypto from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type ProductionCore } from '../../apps/api/src/app.js';

const organizationId='11111111-1111-4111-8111-111111111111';
const collegeId='11111111-1111-4111-8111-111111111112';
const academicYearId='11111111-1111-4111-8111-111111111115';
const academicLevelId='11111111-1111-4111-8111-111111111117';
const cohortId='11111111-1111-4111-8111-111111111118';
const templateVersionId='11111111-1111-4111-8111-111111111133';
const seedStudentId='11111111-1111-4111-8111-111111111124'; // already linked to student@dev.dentpilot.local by seed.ts
const seedEnrollmentId='11111111-1111-4111-8111-111111111125';
// A dedicated, later-starting term in the same academic year. submitDraft's and
// StudentDraftsService.create's term resolution both prefer the most recently started
// ACTIVE term, so every fresh case_sheet this file creates naturally lands here instead
// of on the seed's original term — which other integration test files (api-security.test.ts)
// already drive to a LOCKED term_result_closure. No closure row exists for this term, so
// assertTermUnlocked never blocks it, regardless of what other files do to the seed term.
const isolatedTermId='55555555-5555-4555-8555-555555555501';

const runToken=crypto.randomUUID().replace(/-/g,'').slice(0,12);
const env={...process.env,NODE_ENV:'development',DATABASE_URL:process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@localhost:5432/dentpilot',MINIO_ENDPOINT:process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',MINIO_ACCESS_KEY:process.env.MINIO_ACCESS_KEY ?? 'minioadmin',MINIO_SECRET_KEY:process.env.MINIO_SECRET_KEY ?? 'minio-development-only-change-me',SESSION_COOKIE_SECRET:'this-is-a-test-only-session-cookie-secret-value',CORS_ORIGIN:'http://localhost:5173'};
const migrationUrl=process.env.MIGRATION_DATABASE_URL ?? 'postgresql://dentpilot_migrator:migration-development-only-change-me@localhost:5432/dentpilot';
let core:ProductionCore;
let loginSequence=200; // disjoint from api-security.test.ts's own counter

function cookies(setCookie:string|string[]|undefined):{header:string;csrf:string}{
  const items=Array.isArray(setCookie)?setCookie:[setCookie??''];
  const session=items.find((item)=>item.startsWith('dp_session='))?.split(';')[0]??'';
  const csrf=items.find((item)=>item.startsWith('dp_csrf='))?.split(';')[0]??'';
  return {header:`${session}; ${csrf}`,csrf:decodeURIComponent(csrf.split('=').slice(1).join('='))};
}
async function login(email:string,password='development-only-password'):Promise<{header:string;csrf:string}>{
  const response=await core.app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:`127.0.0.${loginSequence++}`,payload:{organizationId,email,password}});
  expect(response.statusCode).toBe(204);
  return cookies(response.headers['set-cookie']);
}
async function withSetup<T>(fn:(client:pg.Client)=>Promise<T>):Promise<T>{
  const setup=new pg.Client({connectionString:migrationUrl});
  await setup.connect(); await setup.query('BEGIN'); await setup.query("SELECT set_config('app.organization_id',$1,true)",[organizationId]);
  try { const result=await fn(setup); await setup.query('COMMIT'); return result; }
  catch (error) { await setup.query('ROLLBACK'); throw error; }
  finally { await setup.end(); }
}
async function createDraft(auth:{header:string;csrf:string},payload:Record<string,unknown>):Promise<string>{
  const response=await core.app.inject({method:'POST',url:'/api/v1/student/drafts',headers:{cookie:auth.header,'x-csrf-token':auth.csrf},payload:{enrollmentId:seedEnrollmentId,templateVersionId,payload,idempotencyKey:`draft-${crypto.randomUUID()}`}});
  expect(response.statusCode).toBe(201);
  return response.json<{id:string}>().id;
}
async function submitFreshCase(payload:Record<string,unknown>):Promise<string>{
  const auth=await login('student@dev.dentpilot.local');
  const draftId=await createDraft(auth,payload);
  const submitted=await core.app.inject({method:'POST',url:'/api/v1/student/submissions',headers:{cookie:auth.header,'x-csrf-token':auth.csrf},payload:{draftId,idempotencyKey:`submit-${crypto.randomUUID()}`}});
  expect(submitted.statusCode).toBe(201);
  return submitted.json<{snapshotId:string}>().snapshotId;
}

describe('student integration sprint',()=>{
  beforeAll(async()=>{
    core=await buildApp(env);
    await withSetup(async(client)=>{
      await client.query(
        "INSERT INTO terms(id,organization_id,academic_year_id,label,starts_on,ends_on) VALUES($1,$2,$3,$4,'2026-02-01','2026-06-30') ON CONFLICT DO NOTHING",
        [isolatedTermId,organizationId,academicYearId,`Isolated Test Term ${runToken}`],
      );
    });
  });
  afterAll(async()=>core?.app.close());

  describe('student draft lifecycle',()=>{
    it('lets the owning student create, list, read and update a draft with optimistic concurrency',async()=>{
      const auth=await login('student@dev.dentpilot.local');
      const draftId=await createDraft(auth,{procedure:'initial draft'});

      const listed=await core.app.inject({method:'GET',url:'/api/v1/student/drafts',headers:{cookie:auth.header}});
      expect(listed.statusCode).toBe(200);
      expect(listed.json<{items:{id:string}[]}>().items.map((item)=>item.id)).toContain(draftId);

      const detail=await core.app.inject({method:'GET',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:auth.header}});
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({id:draftId,revision:1,payload:{procedure:'initial draft'}});

      const stale=await core.app.inject({method:'PUT',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:auth.header,'x-csrf-token':auth.csrf},payload:{payload:{procedure:'stale edit'},expectedRevision:99,idempotencyKey:`update-${crypto.randomUUID()}`}});
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('CONFLICT');

      const updated=await core.app.inject({method:'PUT',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:auth.header,'x-csrf-token':auth.csrf},payload:{payload:{procedure:'revised draft'},expectedRevision:1,idempotencyKey:`update-${crypto.randomUUID()}`}});
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({id:draftId,revision:2,payload:{procedure:'revised draft'}});
    });

    it('never exposes one student\'s draft to another, for read or write',async()=>{
      const owner=await login('student@dev.dentpilot.local');
      const draftId=await createDraft(owner,{procedure:'private'});

      const otherStudentId=crypto.randomUUID();
      const otherAccountId=crypto.randomUUID();
      const otherEmail=`isolation-${runToken}@dev.dentpilot.local`;
      const otherPassword='an-isolation-development-password';
      const otherHash=await argon2.hash(otherPassword,{type:argon2.argon2id});
      await withSetup(async(client)=>{
        await client.query('INSERT INTO students(id,organization_id,college_id,student_number,display_name) VALUES($1,$2,$3,$4,$5)',[otherStudentId,organizationId,collegeId,`D-DEV-${runToken}`,'Isolation Student']);
        await client.query("INSERT INTO accounts(id,organization_id,college_id,email,password_hash,status,primary_role,student_id) VALUES($1,$2,$3,$4,$5,'ACTIVE','STUDENT_INTEGRATION',$6)",[otherAccountId,organizationId,collegeId,otherEmail,otherHash,otherStudentId]);
      });
      const other=await login(otherEmail,otherPassword);

      const deniedRead=await core.app.inject({method:'GET',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:other.header}});
      expect(deniedRead.statusCode).toBe(404);
      const deniedUpdate=await core.app.inject({method:'PUT',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:other.header,'x-csrf-token':other.csrf},payload:{payload:{procedure:'hijack attempt'},expectedRevision:1,idempotencyKey:`update-${crypto.randomUUID()}`}});
      expect(deniedUpdate.statusCode).toBe(404);

      const ownerStillReads=await core.app.inject({method:'GET',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:owner.header}});
      expect(ownerStillReads.statusCode).toBe(200);
    });

    it('rejects any staff role from touching the student draft endpoints',async()=>{
      const admin=await login('admin@dev.dentpilot.local');
      const list=await core.app.inject({method:'GET',url:'/api/v1/student/drafts',headers:{cookie:admin.header}});
      expect(list.statusCode).toBe(403);
      const create=await core.app.inject({method:'POST',url:'/api/v1/student/drafts',headers:{cookie:admin.header,'x-csrf-token':admin.csrf},payload:{enrollmentId:seedEnrollmentId,templateVersionId,payload:{},idempotencyKey:`draft-${crypto.randomUUID()}`}});
      expect(create.statusCode).toBe(403);
    });

    it('deletes the draft on submission, so a later read or edit correctly reports NOT_FOUND',async()=>{
      const auth=await login('student@dev.dentpilot.local');
      const draftId=await createDraft(auth,{procedure:'to be submitted'});
      const submitted=await core.app.inject({method:'POST',url:'/api/v1/student/submissions',headers:{cookie:auth.header,'x-csrf-token':auth.csrf},payload:{draftId,idempotencyKey:`submit-${crypto.randomUUID()}`}});
      expect(submitted.statusCode).toBe(201);
      const afterSubmit=await core.app.inject({method:'GET',url:`/api/v1/student/drafts/${draftId}`,headers:{cookie:auth.header}});
      expect(afterSubmit.statusCode).toBe(404);
    });
  });

  describe('student account provisioning',()=>{
    it('links a new account to the intended student through an invitation, end to end',async()=>{
      const freshStudentId=crypto.randomUUID();
      const freshEnrollmentId=crypto.randomUUID();
      await withSetup(async(client)=>{
        await client.query('INSERT INTO students(id,organization_id,college_id,student_number,display_name) VALUES($1,$2,$3,$4,$5)',[freshStudentId,organizationId,collegeId,`D-DEV-${runToken}-P`,'Provisioning Student']);
        await client.query('INSERT INTO academic_enrollments(id,organization_id,student_id,academic_year_id,academic_level_id,cohort_id) VALUES($1,$2,$3,$4,$5,$6)',[freshEnrollmentId,organizationId,freshStudentId,academicYearId,academicLevelId,cohortId]);
      });
      const admin=await login('admin@dev.dentpilot.local');
      const email=`provisioned-${runToken}@dev.dentpilot.local`;
      const invited=await core.app.inject({method:'POST',url:'/api/v1/invitations',headers:{cookie:admin.header,'x-csrf-token':admin.csrf},payload:{email,role:'STUDENT_INTEGRATION',studentId:freshStudentId}});
      expect(invited.statusCode).toBe(201);
      const token=invited.json<{invitationToken:string}>().invitationToken;
      const password='a-strong-development-password';
      const redeemed=await core.app.inject({method:'POST',url:'/api/v1/invitations/redeem',payload:{organizationId,token,password}});
      expect(redeemed.statusCode).toBe(204);

      const account=await withSetup(async(client)=>(await client.query('SELECT student_id,primary_role FROM accounts WHERE email=$1',[email])).rows[0]);
      expect(account).toMatchObject({student_id:freshStudentId,primary_role:'STUDENT_INTEGRATION'});

      // Prove the link is live end to end, not just present in the row: log in as the new
      // account and create a draft under the fresh enrollment for the same student — this
      // only succeeds if principal.studentId resolved from the session truly matches.
      const studentAuth=await login(email,password);
      const draft=await core.app.inject({method:'POST',url:'/api/v1/student/drafts',headers:{cookie:studentAuth.header,'x-csrf-token':studentAuth.csrf},payload:{enrollmentId:freshEnrollmentId,templateVersionId,payload:{procedure:'provisioning proof'},idempotencyKey:`draft-${crypto.randomUUID()}`}});
      expect(draft.statusCode).toBe(201);

      // A second invitation for the same, now-linked student must be rejected — the
      // partial unique index on accounts.student_id is the last line of defense, but the
      // issuance-time check in AuthService.issueInvitation should catch it first.
      const secondInvite=await core.app.inject({method:'POST',url:'/api/v1/invitations',headers:{cookie:admin.header,'x-csrf-token':admin.csrf},payload:{email:`second-link-${runToken}@dev.dentpilot.local`,role:'STUDENT_INTEGRATION',studentId:freshStudentId}});
      expect(secondInvite.statusCode).toBe(409);
      expect(secondInvite.json().error.code).toBe('CONFLICT');
    });

    it('rejects a STUDENT_INTEGRATION invitation with no studentId',async()=>{
      const admin=await login('admin@dev.dentpilot.local');
      const response=await core.app.inject({method:'POST',url:'/api/v1/invitations',headers:{cookie:admin.header,'x-csrf-token':admin.csrf},payload:{email:`no-student-${runToken}@dev.dentpilot.local`,role:'STUDENT_INTEGRATION'}});
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a staff invitation that carries a studentId the role cannot use',async()=>{
      const admin=await login('admin@dev.dentpilot.local');
      const response=await core.app.inject({method:'POST',url:'/api/v1/invitations',headers:{cookie:admin.header,'x-csrf-token':admin.csrf},payload:{email:`unexpected-student-${runToken}@dev.dentpilot.local`,role:'DEPARTMENT_ADMIN',studentId:seedStudentId}});
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('student submission read model',()=>{
    it('lists the submission and shows an empty detail shape immediately after submission',async()=>{
      const snapshotId=await submitFreshCase({procedure:'read model baseline'});
      const auth=await login('student@dev.dentpilot.local');
      const list=await core.app.inject({method:'GET',url:'/api/v1/student/submissions',headers:{cookie:auth.header}});
      expect(list.statusCode).toBe(200);
      expect(list.json<{items:{snapshotId:string}[]}>().items.map((item)=>item.snapshotId)).toContain(snapshotId);
      const detail=await core.app.inject({method:'GET',url:`/api/v1/student/submissions/${snapshotId}`,headers:{cookie:auth.header}});
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({snapshotId,status:'SUBMITTED',decisions:[],feedback:[],grade:null,attachments:[]});
    });

    it('shows a published supervisor note and a revision decision, but never an internal-only note',async()=>{
      const snapshotId=await submitFreshCase({procedure:'feedback visibility'});
      const supervisorAuth=await login('supervisor@dev.dentpilot.local');
      const revision=await core.app.inject({method:'POST',url:`/api/v1/staff/submissions/${snapshotId}/revision-requests`,headers:{cookie:supervisorAuth.header,'x-csrf-token':supervisorAuth.csrf},payload:{reason:'Please redo the margins.',idempotencyKey:`revision-${crypto.randomUUID()}`}});
      expect(revision.statusCode).toBe(204);
      await withSetup(async(client)=>{
        await client.query("INSERT INTO supervisor_notes(organization_id,snapshot_id,author_account_id,body,student_visible) VALUES($1,$2,(SELECT id FROM accounts WHERE email='supervisor@dev.dentpilot.local'),$3,false)",[organizationId,snapshotId,'Internal-only concern about technique.']);
        await client.query("INSERT INTO supervisor_notes(organization_id,snapshot_id,author_account_id,body,student_visible) VALUES($1,$2,(SELECT id FROM accounts WHERE email='supervisor@dev.dentpilot.local'),$3,true)",[organizationId,snapshotId,'Please review the margin guidance before resubmitting.']);
      });
      const studentAuth=await login('student@dev.dentpilot.local');
      const detail=await core.app.inject({method:'GET',url:`/api/v1/student/submissions/${snapshotId}`,headers:{cookie:studentAuth.header}});
      expect(detail.statusCode).toBe(200);
      const body=detail.json<{status:string;decisions:{type:string;reason:string|null}[];feedback:{body:string}[]}>();
      expect(body.status).toBe('REVISION_REQUESTED');
      expect(body.decisions).toContainEqual(expect.objectContaining({type:'REQUEST_REVISION',reason:'Please redo the margins.'}));
      const feedbackBodies=body.feedback.map((note)=>note.body);
      expect(feedbackBodies).toContain('Please review the margin guidance before resubmitting.');
      expect(feedbackBodies).not.toContain('Internal-only concern about technique.');
    });

    it('hides the grade by default under the seeded workflow policy, even once one is recorded',async()=>{
      const snapshotId=await submitFreshCase({procedure:'grade visibility'});
      const supervisorAuth=await login('supervisor@dev.dentpilot.local');
      const supervisorHeaders={cookie:supervisorAuth.header,'x-csrf-token':supervisorAuth.csrf};
      expect((await core.app.inject({method:'POST',url:`/api/v1/staff/submissions/${snapshotId}/approve-start`,headers:supervisorHeaders,payload:{idempotencyKey:`approve-start-${crypto.randomUUID()}`}})).statusCode).toBe(204);
      expect((await core.app.inject({method:'POST',url:`/api/v1/staff/submissions/${snapshotId}/approve-final`,headers:supervisorHeaders,payload:{idempotencyKey:`approve-final-${crypto.randomUUID()}`}})).statusCode).toBe(204);
      expect((await core.app.inject({method:'POST',url:`/api/v1/staff/submissions/${snapshotId}/grades`,headers:supervisorHeaders,payload:{grade:88,comment:'Well done',idempotencyKey:`grade-${crypto.randomUUID()}`}})).statusCode).toBe(204);
      const studentAuth=await login('student@dev.dentpilot.local');
      const detail=await core.app.inject({method:'GET',url:`/api/v1/student/submissions/${snapshotId}`,headers:{cookie:studentAuth.header}});
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({status:'GRADED',grade:null});
    });

    it('keeps the STUDENT_INTEGRATION principal out of every staff submission route',async()=>{
      const snapshotId=await submitFreshCase({procedure:'staff route boundary'});
      const studentAuth=await login('student@dev.dentpilot.local');
      const list=await core.app.inject({method:'GET',url:'/api/v1/staff/submissions',headers:{cookie:studentAuth.header}});
      expect(list.statusCode).toBe(403);
      const detail=await core.app.inject({method:'GET',url:`/api/v1/staff/submissions/${snapshotId}`,headers:{cookie:studentAuth.header}});
      expect(detail.statusCode).toBe(403);
    });
  });
});
