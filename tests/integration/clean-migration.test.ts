import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const adminUrl=process.env.ADMIN_DATABASE_URL ?? 'postgresql://dentpilot_owner:owner-development-only-change-me@localhost:5432/postgres';
const migrationBase=process.env.MIGRATION_DATABASE_URL ?? 'postgresql://dentpilot_migrator:migration-development-only-change-me@localhost:5432/dentpilot';
const appBase=process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@localhost:5432/dentpilot';
const databaseName=`dentpilot_clean_${process.pid}_${Date.now()}`;
const forDatabase=(connectionString:string,name:string):string=>{const url=new URL(connectionString);url.pathname=`/${name}`;return url.toString();};
let admin:pg.Client;
let migration:pg.Client;
let app:pg.Client;
let adminConnected=false;
let migrationConnected=false;
let appConnected=false;

describe('clean PostgreSQL 16 migration and tenant security',()=>{
  beforeAll(async()=>{
    admin=new pg.Client({connectionString:adminUrl});
    await admin.connect();
    adminConnected=true;
    await admin.query(`CREATE DATABASE ${databaseName} OWNER dentpilot_migrator`);
    migration=new pg.Client({connectionString:forDatabase(migrationBase,databaseName)});
    await migration.connect();
    migrationConnected=true;
    const migrations=fs.readdirSync(path.resolve('database/migrations')).filter((name)=>/^\d+.*\.sql$/.test(name)).sort();
    await migration.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const filename of migrations) {
      const sql=fs.readFileSync(path.resolve('database/migrations',filename),'utf8');
      await migration.query('BEGIN');
      try { await migration.query(sql); await migration.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]); await migration.query('COMMIT'); }
      catch(error) { await migration.query('ROLLBACK'); throw error; }
    }
    app=new pg.Client({connectionString:forDatabase(appBase,databaseName)});
    await app.connect();
    appConnected=true;
  },30000);

  afterAll(async()=>{
    if(appConnected) await app.end();
    if(migrationConnected) await migration.end();
    if(adminConnected) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',[databaseName]);
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await admin.end();
    }
  });

  it('creates each formerly duplicated object exactly once',async()=>{
    const columns=await migration.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='student_id'");
    expect(columns.rows[0].count).toBe(1);
    const indexes=await migration.query("SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='public' AND tablename='group_memberships' AND indexdef LIKE '%(organization_id, enrollment_id, department_id)%status%ACTIVE%'");
    expect(indexes.rows[0].count).toBe(1);
    const fileStatus=await migration.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='file_objects' AND column_name IN ('status','completed_at')");
    expect(fileStatus.rows[0].count).toBe(2);
    const applied=await migration.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(applied.rows.map((row)=>row.filename)).toEqual(['0001_initial.sql','0002_phase2a_api_contract.sql','0003_student_integration.sql','0004_supervisor_operations_phase1.sql']);
  });

  it('uses an application role that cannot bypass RLS',async()=>{
    const role=await admin.query<{rolsuper:boolean;rolbypassrls:boolean}>("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='dentpilot_app'");
    expect(role.rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
  });

  it('prevents cross-tenant reads through the real application role',async()=>{
    const orgA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orgB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    for(const [id,slug] of [[orgA,'clean-a'],[orgB,'clean-b']] as const) {
      await migration.query('BEGIN');
      await migration.query("SELECT set_config('app.organization_id',$1,true)",[id]);
      await migration.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)',[id,slug,slug]);
      await migration.query('INSERT INTO colleges(organization_id,name) VALUES($1,$2)',[id,`${slug}-college`]);
      await migration.query('COMMIT');
    }
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.organization_id',$1,true)",[orgA]);
    const own=await app.query('SELECT id FROM colleges');
    const other=await app.query('SELECT id FROM colleges WHERE organization_id=$1',[orgB]);
    await app.query('ROLLBACK');
    expect(own.rowCount).toBe(1);
    expect(other.rowCount).toBe(0);
  });
});
