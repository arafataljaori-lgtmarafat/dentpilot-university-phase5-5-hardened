# DentPilot University — Phase 5.5 Hardened

Secure TypeScript modular-monolith foundation for the DentPilot University academic and clinical workflow. This repository contains the Phase 5.5 Hardened snapshot, including the Supervisor Operations hardening work, shared contracts, PostgreSQL migrations, MinIO-backed private file flow, and the diagnostic web application.

> **Release status:** This snapshot is published for engineering review and continued hardening. It must not be treated as production-ready until the real PostgreSQL/MinIO integration gate passes and the remaining authorization, lifecycle, contract, and operational risks are closed.

## Repository scope

The repository intentionally preserves the existing project structure and migrations. `reference/prototype-v7/` is behavior and UX reference only; it is not production code. The Supervisor and Control surfaces are included for engineering validation and are subject to the acceptance gates documented in `docs/operations/runbook.md` and `docs/operations/known-limitations.md`.

## Requirements

Use Node.js 22 or newer and Docker Compose. Never commit `.env`, production credentials, private keys, generated `dist/` output, dependency directories, or logs.

## Local setup

```bash
npm ci
cp .env.example .env
npm run infra:up
npm run db:migrate
npm run db:seed
npm run typecheck
npm run lint
npm run test:unit
npm test
```

Set the migration and seed credentials explicitly through `MIGRATION_DATABASE_URL` and `SEED_DATABASE_URL`. The runtime role `dentpilot_app` must remain `NOSUPERUSER NOBYPASSRLS`; the migrator role is only for release migration and seed operations.

## Health and API documentation

After starting the API and web application, verify:

- `/health/live`
- `/health/ready`
- `/openapi.json`
- `/docs`

## CI

GitHub Actions runs dependency installation, package/API/web type checking, the repository lint command, unit tests, and a production-dependency audit. Integration tests require real PostgreSQL and MinIO services and must be reported as `NOT EXECUTED` when those services are unavailable; skipped integration tests are not a passing release gate.

## Security

Do not use the development values in `.env.example` outside local development. Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md). See the operational runbook for deployment limitations and release acceptance criteria.
