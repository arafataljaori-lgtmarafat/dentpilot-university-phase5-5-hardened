import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const root = process.cwd();
const defaultSuites = fs
  .readdirSync(path.resolve(root, 'tests/integration'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => path.join('tests/integration', name));
const suites = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultSuites;

const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://dentpilot_migrator:migration-development-only-change-me@127.0.0.1:5432/dentpilot';
const applicationUrl = process.env.DATABASE_URL ?? 'postgresql://dentpilot_app:app-development-only-change-me@127.0.0.1:5432/dentpilot';
const adminUrl = process.env.ADMIN_DATABASE_URL ?? 'postgresql://dentpilot_owner:owner-development-only-change-me@127.0.0.1:5432/postgres';
const commonEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? 'minio-development-only-change-me',
  SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET ?? 'this-is-a-test-only-session-cookie-secret-value',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};

function databaseUrlFor(base: string, databaseName: string): string {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function createDatabase(admin: pg.Client, databaseName: string): Promise<void> {
  await admin.query(`CREATE DATABASE "${databaseName}" OWNER dentpilot_migrator`);
}

async function dropDatabase(admin: pg.Client, databaseName: string): Promise<void> {
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [databaseName]);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
}

async function main(): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const [index, suite] of suites.entries()) {
      const databaseName = `dentpilot_it_${process.pid}_${index}_${Date.now()}`;
      const suiteDatabaseUrl = databaseUrlFor(applicationUrl, databaseName);
      const suiteMigrationUrl = databaseUrlFor(migrationUrl, databaseName);
      console.log(`\n=== isolated integration suite: ${suite} (${databaseName}) ===`);
      await createDatabase(admin, databaseName);
      try {
        const migrationEnv = { ...commonEnv, MIGRATION_DATABASE_URL: suiteMigrationUrl };
        run(process.execPath, ['--import', 'tsx', 'database/migrations/run.ts'], migrationEnv);
        run(process.execPath, ['--import', 'tsx', 'database/seeds/seed.ts'], { ...commonEnv, SEED_DATABASE_URL: suiteMigrationUrl });
        run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', suite], {
          ...commonEnv,
          DATABASE_URL: suiteDatabaseUrl,
          MIGRATION_DATABASE_URL: suiteMigrationUrl,
          ADMIN_DATABASE_URL: adminUrl,
        });
      } finally {
        await dropDatabase(admin, databaseName);
      }
    }
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
