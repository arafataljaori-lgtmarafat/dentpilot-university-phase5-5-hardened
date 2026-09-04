import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { IdempotencyService } from '../../apps/api/src/infrastructure/idempotency.js';
import type { Principal } from '../../apps/api/src/security/auth.js';

interface Stored {request_hash:string;response_status:number;response_body:unknown}

function fakeClient(): PoolClient {
  const records=new Map<string,Stored>();
  return {
    query: async (sql:string,params:unknown[]=[])=>{
      if(sql.startsWith('SELECT pg_advisory')||sql.startsWith('DELETE FROM idempotency_keys')) return {rows:[],rowCount:0};
      if(sql.startsWith('SELECT request_hash')) {
        const record=records.get(`${params[0]}:${params[1]}`);
        return {rows:record?[record]:[],rowCount:record?1:0};
      }
      if(sql.startsWith('INSERT INTO idempotency_keys')) {
        records.set(`${params[1]}:${params[2]}`,{request_hash:String(params[3]),response_status:Number(params[4]),response_body:JSON.parse(String(params[5]))});
        return {rows:[],rowCount:1};
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as PoolClient;
}

const principal:Principal={accountId:'11111111-1111-4111-8111-111111111119',organizationId:'11111111-1111-4111-8111-111111111111',collegeId:'11111111-1111-4111-8111-111111111112',role:'UNIVERSITY_ADMIN',departmentIds:[]};

describe('idempotency service',()=>{
  it('replays the stored response without executing the command twice',async()=>{
    const service=new IdempotencyService(); const client=fakeClient(); let executions=0;
    const command={key:'stable-key-00001',operation:'test.command',request:{b:2,a:1},responseStatus:201,execute:async()=>{executions+=1;return {id:'result'};}};
    const first=await service.run(client,principal,command);
    const second=await service.run(client,principal,{...command,request:{a:1,b:2}});
    expect(first).toMatchObject({body:{id:'result'},responseStatus:201,replayed:false});
    expect(second).toMatchObject({body:{id:'result'},responseStatus:201,replayed:true});
    expect(executions).toBe(1);
  });

  it('rejects reuse of a key with a different payload',async()=>{
    const service=new IdempotencyService(); const client=fakeClient();
    await service.run(client,principal,{key:'stable-key-00002',operation:'test.command',request:{value:1},responseStatus:204,execute:async()=>({})});
    await expect(service.run(client,principal,{key:'stable-key-00002',operation:'test.command',request:{value:2},responseStatus:204,execute:async()=>({})})).rejects.toMatchObject({statusCode:409,code:'CONFLICT'});
  });
});
