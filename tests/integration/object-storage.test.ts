import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectStorage } from '../../apps/api/src/infrastructure/object-storage.js';

const endpoint=process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
const storage=new ObjectStorage(endpoint,process.env.MINIO_ACCESS_KEY ?? 'minioadmin',process.env.MINIO_SECRET_KEY ?? 'minio-development-only-change-me');
const orgA='11111111-1111-4111-8111-111111111111'; const orgB='22222222-2222-4222-8222-222222222222';
const payload=Buffer.from('DentPilot private object integration test'); const sha256=crypto.createHash('sha256').update(payload).digest('hex');
let key:string;

describe('private object storage',()=>{
  beforeAll(async()=>{await storage.ensureBucket();key=storage.createObjectKey(orgA);});
  afterAll(async()=>{if(key) await storage.deleteObject(key);});

  it('creates opaque tenant-prefixed keys without cross-tenant overlap',()=>{
    expect(key.startsWith(`${orgA}/`)).toBe(true); expect(storage.createObjectKey(orgB).startsWith(`${orgB}/`)).toBe(true); expect(key).not.toContain(payload.toString());
  });

  it('requires the signed type, size, and checksum and supports private signed reads',async()=>{
    const upload=await storage.signedUpload(key,'application/pdf',payload.length,sha256);
    expect(upload.url).toContain('X-Amz-Expires=300'); expect(upload.requiredHeaders['x-amz-checksum-sha256']).toBe(Buffer.from(sha256,'hex').toString('base64'));
    const put=await fetch(upload.url,{method:'PUT',headers:upload.requiredHeaders,body:payload}); expect(put.status).toBe(200);
    const direct=await fetch(`${endpoint}/dentpilot-private/${key}`); expect([401,403]).toContain(direct.status);
    const readUrl=await storage.signedRead(key); expect(readUrl).toContain('X-Amz-Expires=300'); const read=await fetch(readUrl); expect(read.status).toBe(200); expect(Buffer.from(await read.arrayBuffer())).toEqual(payload);
  });

  it('rejects a signed upload when a signed content header is changed',async()=>{
    const otherKey=storage.createObjectKey(orgA); const upload=await storage.signedUpload(otherKey,'application/pdf',payload.length,sha256);
    const response=await fetch(upload.url,{method:'PUT',headers:{...upload.requiredHeaders,'content-type':'image/png'},body:payload});
    expect(response.status).toBe(403); await storage.deleteObject(otherKey);
  });
});
