import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required. Migrations must not run with the application credential.');
const client = new pg.Client({ connectionString: databaseUrl });

async function main(): Promise<void> {
  await client.connect();
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = fs.readdirSync(__dirname).filter((file) => file.endsWith('.sql')).sort();
  for (const filename of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (applied.rowCount) continue;
    const sql = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]); await client.query('COMMIT'); console.log(`Applied ${filename}`); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  await client.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
