import crypto from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@localhost:5432/dentpilot';
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://dentpilot_migrator:migration-development-only-change-me@localhost:5432/dentpilot';

const orgA = '11111111-1111-4111-8111-111111111111';

let client: pg.Client;
let migration: pg.Client;

async function tenant(org: string): Promise<void> {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.organization_id',$1,true)", [org]);
}

async function rollback(): Promise<void> {
  await client.query('ROLLBACK');
}

describe('Supervisor Operations Phase 1 Database', () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: databaseUrl });
    migration = new pg.Client({ connectionString: migrationUrl });
    await client.connect();
    await migration.connect();
  });

  afterAll(async () => {
    await client?.end();
    await migration?.end();
  });

  it('verifies that the new tables exist', async () => {
    const tables = [
      'supervisor_permission_set_versions',
      'supervisor_permission_set_items',
      'supervisor_permission_grants',
      'clinical_duty_schedules',
      'clinical_duty_shifts',
      'clinical_duty_members',
      'clinical_case_duty_links',
      'clinical_evaluation_events'
    ];
    for (const table of tables) {
      const result = await migration.query('SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', ['public', table]);
      expect(result.rowCount).toBe(1);
    }
  });

  it('rejects invalid permissions in supervisor_permission_set_items', async () => {
    await tenant(orgA);
    const versionId = crypto.randomUUID();
    
    // Create a version first
    await client.query(
      'INSERT INTO supervisor_permission_set_versions (id, organization_id, version_number) VALUES ($1, $2, $3)',
      [versionId, orgA, 100]
    );

    // Try valid permission
    await client.query(
      'INSERT INTO supervisor_permission_set_items (organization_id, version_id, permission) VALUES ($1, $2, $3)',
      [orgA, versionId, 'START_APPROVAL']
    );

    // Try invalid permission
    await expect(client.query(
      'INSERT INTO supervisor_permission_set_items (organization_id, version_id, permission) VALUES ($1, $2, $3)',
      [orgA, versionId, 'FINAL_ACADEMIC_APPROVAL']
    )).rejects.toThrow();

    await rollback();
  });

  it('rejects mutation of published supervisor_permission_set_versions', async () => {
    await tenant(orgA);
    const versionId = crypto.randomUUID();
    
    await client.query(
      "INSERT INTO supervisor_permission_set_versions (id, organization_id, version_number, status) VALUES ($1, $2, $3, 'PUBLISHED')",
      [versionId, orgA, 101]
    );

    await expect(client.query(
      "UPDATE supervisor_permission_set_versions SET effective_at = now() WHERE id = $1",
      [versionId]
    )).rejects.toThrow('published version is immutable');

    await rollback();
  });

  it('rejects shift end before start', async () => {
    await tenant(orgA);
    const scheduleId = crypto.randomUUID();

    await client.query(
      `INSERT INTO clinical_duty_schedules (id, organization_id, department_id, academic_year_id, timezone, valid_from, valid_to) 
       VALUES ($1, $2, '11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111115', 'UTC', now(), now() + interval '1 day')`,
      [scheduleId, orgA]
    );

    await expect(client.query(
      `INSERT INTO clinical_duty_shifts (organization_id, schedule_id, starts_at, ends_at) 
       VALUES ($1, $2, now() + interval '2 hours', now() + interval '1 hour')`,
      [orgA, scheduleId]
    )).rejects.toThrow();

    await rollback();
  });

  it('rejects modification of started shift date/time', async () => {
    await tenant(orgA);
    const scheduleId = crypto.randomUUID();
    const shiftId = crypto.randomUUID();

    await client.query(
      `INSERT INTO clinical_duty_schedules (id, organization_id, department_id, academic_year_id, timezone, valid_from, valid_to) 
       VALUES ($1, $2, '11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111115', 'UTC', now(), now() + interval '1 day')`,
      [scheduleId, orgA]
    );

    // Create a shift that started in the past
    await client.query(
      `INSERT INTO clinical_duty_shifts (id, organization_id, schedule_id, starts_at, ends_at) 
       VALUES ($1, $2, $3, now() - interval '1 hour', now() + interval '1 hour')`,
      [shiftId, orgA, scheduleId]
    );

    await expect(client.query(
      `UPDATE clinical_duty_shifts SET ends_at = now() + interval '2 hours' WHERE id = $1`,
      [shiftId]
    )).rejects.toThrow('cannot modify shift time after it has started');

    await rollback();
  });

  it('rejects evaluation events with out of bounds score or updates', async () => {
    await tenant(orgA);
    
    // Try score > 10
    // We would need references to snapshot_id, evaluator_account_id, duty_member_id, permission_set_version_id
    // But since foreign keys exist, testing this without valid FKs will fail on FK constraint first.
    // However, if we just check that the constraint exists, or disable FKs temporarily.
    // It's better to just ensure the constraint triggers by inserting. 
    // The test might throw a foreign key error first unless we use a valid duty_member_id etc.
    // Let's test just the existence of the constraints by checking system catalogs, or inserting valid FKs.
    
    const snapshotId = '11111111-1111-4111-8111-111111111137'; // From invariants test
    const accountId = '11111111-1111-4111-8111-111111111119'; // From invariants test
    const versionId = crypto.randomUUID();
    const scheduleId = crypto.randomUUID();
    const shiftId = crypto.randomUUID();
    const dutyMemberId = crypto.randomUUID();
    const grantId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();

    await client.query(
      "INSERT INTO supervisor_permission_set_versions (id, organization_id, version_number) VALUES ($1, $2, $3)",
      [versionId, orgA, 102]
    );

    await client.query(
      `INSERT INTO supervisor_assignments(id,organization_id,supervisor_account_id,department_id,academic_year_id,academic_level_id,cohort_id,status,effective_from,reason) 
       VALUES($1,$2,$3,'11111111-1111-4111-8111-111111111113','11111111-1111-4111-8111-111111111115','11111111-1111-4111-8111-111111111117','11111111-1111-4111-8111-111111111118','ACTIVE',now(),'test')`,
      [assignmentId, orgA, accountId]
    );

    await client.query(
      "INSERT INTO supervisor_permission_grants (id, organization_id, assignment_id, permission_set_version_id, effective_from) VALUES ($1, $2, $3, $4, now())",
      [grantId, orgA, assignmentId, versionId]
    );

    await client.query(
      `INSERT INTO clinical_duty_schedules (id, organization_id, department_id, academic_year_id, timezone, valid_from, valid_to) 
       VALUES ($1, $2, '11111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111115', 'UTC', now(), now() + interval '1 day')`,
      [scheduleId, orgA]
    );

    await client.query(
      `INSERT INTO clinical_duty_shifts (id, organization_id, schedule_id, starts_at, ends_at) 
       VALUES ($1, $2, $3, now() + interval '1 hour', now() + interval '2 hours')`,
      [shiftId, orgA, scheduleId]
    );

    await client.query(
      `INSERT INTO clinical_duty_members (id, organization_id, shift_id, assignment_id, grant_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [dutyMemberId, orgA, shiftId, assignmentId, grantId]
    );

    // Test Score > 10 in an isolated savepoint so the outer transaction remains usable.
    await client.query('SAVEPOINT invalid_score_high');
    await expect(client.query(
      `INSERT INTO clinical_evaluation_events (organization_id, snapshot_id, evaluator_account_id, duty_member_id, permission_set_version_id, score) 
       VALUES ($1, $2, $3, $4, $5, 11)`,
      [orgA, snapshotId, accountId, dutyMemberId, versionId]
    )).rejects.toThrow();
    await client.query('ROLLBACK TO SAVEPOINT invalid_score_high');

    // Test Score < 0 in an isolated savepoint for the same reason.
    await client.query('SAVEPOINT invalid_score_low');
    await expect(client.query(
      `INSERT INTO clinical_evaluation_events (organization_id, snapshot_id, evaluator_account_id, duty_member_id, permission_set_version_id, score) 
       VALUES ($1, $2, $3, $4, $5, -1)`,
      [orgA, snapshotId, accountId, dutyMemberId, versionId]
    )).rejects.toThrow();
    await client.query('ROLLBACK TO SAVEPOINT invalid_score_low');

    // Insert valid score
    const eventId = crypto.randomUUID();
    await client.query(
      `INSERT INTO clinical_evaluation_events (id, organization_id, snapshot_id, evaluator_account_id, duty_member_id, permission_set_version_id, score) 
       VALUES ($1, $2, $3, $4, $5, $6, 8.5)`,
      [eventId, orgA, snapshotId, accountId, dutyMemberId, versionId]
    );

    // Test append-only
    await expect(client.query(
      `UPDATE clinical_evaluation_events SET score = 9.0 WHERE id = $1`,
      [eventId]
    )).rejects.toThrow('immutable record');

    await rollback();
  });
});
