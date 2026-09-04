# Security Policy

## Supported snapshot

The `main` branch is the published engineering snapshot. It is not a production release until the integration and security acceptance gates in the operational documentation pass.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Contact the repository owner privately through GitHub with a concise description, affected component, reproduction steps, and impact assessment. Do not include passwords, access tokens, private keys, or personal data in the report.

## Secret handling

Never commit `.env` files, production credentials, private keys, session secrets, MinIO access keys, database passwords, or generated logs. The values in `.env.example` are development placeholders only and must be replaced before any non-local deployment.

## Release expectation

A release must pass type checking, lint, unit tests, clean migration and seed verification, PostgreSQL and MinIO integration tests, tenant-isolation checks, authorization checks, and session/invitation lifecycle checks. A skipped or infrastructure-blocked integration test is not a successful security gate.
