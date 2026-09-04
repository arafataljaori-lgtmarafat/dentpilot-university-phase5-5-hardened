# Production Operations Runbook

## Startup and shutdown

Use an immutable build produced by `npm ci && npm run ci`. Apply migrations as a separately authorized release step before starting API replicas. Start dependencies first, require `/health/ready` to return 200, and then admit traffic. During shutdown, remove the replica from the load balancer, allow in-flight requests to drain, send SIGTERM, and wait for PostgreSQL connections to close. Do not use `infra:down` in production because the development script removes volumes.

## Secret management and rotation

Store `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SEED_DATABASE_URL`, MinIO credentials, and `SESSION_COOKIE_SECRET` in the deployment platform secret manager. Do not place them in images, source control, logs, or client bundles. The application receives only `dentpilot_app` (`NOSUPERUSER NOBYPASSRLS`); release migration/seed receives the separate migrator credential only for that job. Use separate credentials per environment. Rotate database and object-storage credentials by adding the new credential, deploying consumers, verifying readiness, and then revoking the old credential. Rotating `SESSION_COOKIE_SECRET` invalidates cookies unless a multi-key verification window is implemented; schedule the user impact and revoke server sessions at the same time.

## Sessions and invitation tokens

Sessions expire after eight hours, are stored as SHA-256 token hashes, use HTTP-only SameSite=Strict cookies, and are revoked on logout and when a new login rotates the account session. Review and remove expired sessions with a scheduled database job. Invitation tokens expire after 72 hours, are single-use, are stored only as hashes, and must never be returned outside development.

## Backups and restore

Take encrypted PostgreSQL base backups plus continuous WAL archiving. Retain daily backups for 35 days and monthly backups according to institutional policy. Enable versioned private object-storage replication or snapshots. A restore drill must restore PostgreSQL and the matching object-storage recovery point into an isolated environment, run migrations only when explicitly approved, verify tenant RLS, count immutable snapshots/audit events, sample attachment checksums, and record recovery point and recovery time results. Never test restore by overwriting production.

## Logging and monitoring

Collect structured API logs with request ID, route, status, latency, and stable error code. Do not log credentials, cookies, CSRF tokens, invitation tokens, signed URLs, clinical payloads, student names, or file keys. Alert on readiness failures, 5xx rate, authentication failure spikes, database pool saturation, migration failure, MinIO errors, outbox backlog age, backup failure, and disk capacity. Forward audit and outbox records to an access-controlled append-only retention tier.

## Retention and deletion

Retention periods require university legal, academic, and clinical approval. Until approved, do not implement destructive automated deletion of submissions, grade events, audit events, or result closures. Expired sessions, expired idempotency keys, unused expired invitations, abandoned unattached uploads, and processed outbox rows may be purged only through reviewed jobs with metrics and dry-run support.

## Deployment

Build from a reviewed commit with `npm ci`, unit and integration tests, typecheck, lint, build, dependency audit, and a secret scan. Apply database migration against a backup-tested target. Deploy to staging, run health/OpenAPI and authorization smoke tests, then deploy progressively. Roll back application code only when it remains compatible with the applied schema. Database rollback requires a separately reviewed forward-fix or restore plan; never edit `schema_migrations` manually.

## Incident response

Classify suspected tenant leakage, privilege escalation, credential exposure, audit tampering, and public object access as high severity. Preserve logs and database/object-store evidence, restrict access, rotate exposed credentials, revoke affected sessions/invitations, and disable the affected endpoint or deployment when containment requires it. Identify affected organizations and records through audit correlation IDs. Notify the institutional privacy/security authority under the approved communications plan. Complete root-cause analysis and regression tests before restoring normal access.
