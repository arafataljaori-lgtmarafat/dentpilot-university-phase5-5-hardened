import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type ProductionCore } from '../../apps/api/src/app.js';

const organizationId='11111111-1111-4111-8111-111111111111';
const draftId='11111111-1111-4111-8111-111111111135';
const env={...process.env,NODE_ENV:'development',DATABASE_URL:process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@localhost:5432/dentpilot',MINIO_ENDPOINT:process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',MINIO_ACCESS_KEY:process.env.MINIO_ACCESS_KEY ?? 'minioadmin',MINIO_SECRET_KEY:process.env.MINIO_SECRET_KEY ?? 'minio-development-only-change-me',SESSION_COOKIE_SECRET:'this-is-a-test-only-session-cookie-secret-value',CORS_ORIGIN:'http://localhost:5173'};
let core:ProductionCore;

function sessionCookies(setCookie:string|string[]|undefined):{cookie:string;csrf:string}{
  const values=Array.isArray(setCookie)?setCookie:[setCookie??''];
  const session=values.find((value)=>value.startsWith('dp_session='))?.split(';')[0]??'';
  const csrfCookie=values.find((value)=>value.startsWith('dp_csrf='))?.split(';')[0]??'';
  return {cookie:`${session}; ${csrfCookie}`,csrf:decodeURIComponent(csrfCookie.split('=').slice(1).join('='))};
}

describe('private file lifecycle against PostgreSQL and MinIO',()=>{
  beforeAll(async()=>{core=await buildApp(env);});
  afterAll(async()=>core?.app.close());

  it('presigns, uploads, verifies, links and authorizes the attachment lifecycle',async()=>{
    const login=await core.app.inject({method:'POST',url:'/api/v1/auth/login',payload:{organizationId,email:'student@dev.dentpilot.local',password:'development-only-password'}});
    expect(login.statusCode).toBe(204);
    const auth=sessionCookies(login.headers['set-cookie']);
    const bytes=Buffer.from('DentPilot Phase 2A attachment verification');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const suffix=Date.now().toString(36);
    const presign=await core.app.inject({method:'POST',url:'/api/v1/files/presign-upload',headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:{contentType:'application/pdf',byteSize:bytes.length,sha256,idempotencyKey:`file-presign-${suffix}-0001`}});
    expect(presign.statusCode).toBe(201);
    const signed=presign.json<{fileId:string;uploadUrl:string;requiredHeaders:Record<string,string>}>();
    expect(signed.fileId).toBeTruthy();
    const uploaded=await fetch(signed.uploadUrl,{method:'PUT',headers:signed.requiredHeaders,body:bytes});
    expect(uploaded.status).toBeLessThan(300);
    const complete=await core.app.inject({method:'POST',url:`/api/v1/files/${signed.fileId}/complete`,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:{idempotencyKey:`file-complete-${suffix}-0001`}});
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({fileId:signed.fileId,status:'UPLOADED'});
    const linked=await core.app.inject({method:'POST',url:`/api/v1/files/${signed.fileId}/attachments`,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:{draftId,idempotencyKey:`file-link-${suffix}-0001`}});
    expect(linked.statusCode).toBe(201);
    expect(linked.json()).toMatchObject({fileId:signed.fileId,draftId});
    const submitted=await core.app.inject({method:'POST',url:'/api/v1/student/submissions',headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},payload:{draftId,idempotencyKey:`file-submit-${suffix}-0001`}});
    expect(submitted.statusCode).toBe(201);
    const snapshotId=submitted.json<{snapshotId:string}>().snapshotId;
    const read=await core.app.inject({method:'GET',url:`/api/v1/files/${signed.fileId}/presign-read`,headers:{cookie:auth.cookie}});
    expect(read.statusCode).toBe(200);
    expect(read.json().readUrl).toMatch(/^http/);
    const state=await core.db.withTenant({organizationId},async(client)=>{
      const result=await client.query<{status:string;draft_id:string|null;snapshot_id:string;attachment_snapshot:unknown}>('SELECT f.status,a.draft_id,a.snapshot_id,s.attachment_snapshot FROM file_objects f JOIN attachments a ON a.file_object_id=f.id JOIN submission_snapshots s ON s.id=a.snapshot_id WHERE f.id=$1',[signed.fileId]);
      const audit=await client.query<{action:string}>("SELECT action FROM audit_events WHERE entity_id::text=$1 OR metadata->>'fileId'=$1 ORDER BY created_at",[signed.fileId]);
      return {...result.rows[0],auditActions:audit.rows.map((row)=>row.action)};
    });
    expect(state).toEqual({status:'LINKED',draft_id:null,snapshot_id:snapshotId,attachment_snapshot:[{fileId:signed.fileId,contentType:'application/pdf',byteSize:bytes.length,sha256}],auditActions:['FILE_UPLOAD_AUTHORIZED','FILE_UPLOAD_COMPLETED','FILE_ATTACHMENT_LINKED']});
  });
});
