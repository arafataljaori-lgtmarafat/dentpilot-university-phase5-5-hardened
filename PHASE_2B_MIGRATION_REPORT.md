# DentPilot University — Phase 2B Migration Report

## 1. Executive status

| Item | Result |
| --- | --- |
| Phase | Phase 2B React Migration |
| Date | 2026-09-03 UTC |
| Frontend implementation | **IMPLEMENTED** for the screens supported by the approved Phase 2A contracts |
| Backend Core changes | **NONE** |
| Prototype runtime dependencies | **REMOVED / NOT IMPORTED** |
| Frontend build gate | **PASS** |
| Unit and static boundary gate | **PASS — 73/73** |
| UI → API → PostgreSQL/MinIO acceptance | **NOT EXECUTED** because Docker and the services are unavailable in this environment |
| Completion declaration | **ACCEPTANCE PENDING**; the code is ready for a Docker-backed acceptance run, but it is not declared End-to-End Complete |

Phase 2B replaced the diagnostic React shell with a typed production client. The v7 prototype was used as a visual and workflow reference only. No prototype data file, mock database, role switcher, fake login, `localStorage`, or client-side state transition was moved into the runtime.

## 2. Scope analyzed

The full v7 reference archive `DentPilot-University-Portal-Sanaa-Premium-Institutional-Corrected.zip` was reviewed together with `PORTAL_MIGRATION_MAP.md`, the Phase 2A contracts, the OpenAPI route schemas, and the actual API route implementation.

The migration preserved the established RTL institutional hierarchy: fixed role navigation, dense data tables, scope filters, status badges, academic profile timelines, clinical action panels, and responsive supervisor navigation. It did not copy the prototype's HTML-string renderer or global JavaScript state.

## 3. Frontend architecture implemented

```text
apps/web/src/
  app/          Portal shell, route composition, render error boundary
  api/          Typed HTTP client and asynchronous resource state
  auth/         In-memory session provider and login/logout/restore flow
  components/   Loading, empty, error, table, pager, field, metric components
  features/     Dashboard, catalogs, students, assignments, submissions, reports
  routing/      Hash route state and navigation
```

### Architectural boundaries

- The client sends `credentials: 'include'` on every request.
- Mutations read the `dp_csrf` cookie at request time and send `x-csrf-token`.
- The session principal is restored from `GET /api/v1/session` and kept in React memory only.
- HTTP 401 clears the in-memory principal; 403 and 409 are rendered as explicit server errors.
- Navigation by role is presentation-only. Direct requests remain subject to Backend authorization and PostgreSQL RLS.
- Clinical assignment permissions are read from the Backend assignment DTO before showing action controls. The Backend remains authoritative if the UI is bypassed.
- Mutation success is displayed only after the API resolves successfully.
- IDs and idempotency keys use `crypto.randomUUID()`; no client-generated audit events or business records exist.
- No domain state machine, grade eligibility rule, tenant rule, or transition rule was recreated in React.

## 4. Migrated screens and APIs

| Stage | Screen / flow | APIs used | Migration status |
| --- | --- | --- | --- |
| 1 | Login | `POST /api/v1/auth/login` | Implemented |
| 1 | Session restore and logout | `GET /api/v1/session`, `POST /api/v1/auth/logout` | Implemented |
| 1 | Dashboard | `GET /api/v1/reports/dashboard`, `GET /api/v1/reports/scoped`, catalogs | Implemented |
| 1 | Role-aware navigation | Session actor DTO; no account/role switcher | Implemented as presentation-only |
| 2 | Students list | `GET /api/v1/students` with server filters and paging | Implemented |
| 2 | Student detail | `GET /api/v1/students/:id` | Implemented |
| 2 | Departments | `GET /api/v1/catalog/departments` | Implemented |
| 2 | Academic context selectors | `GET /catalog/academic-years`, `/academic-levels`, `/cohorts` | Implemented |
| 2 | Groups | `GET /api/v1/groups` | Implemented |
| 2 | Supervisor assignments | `GET /api/v1/supervisor-assignments` | Implemented |
| 3 | Staff submissions list/detail | `GET /api/v1/staff/submissions`, `GET /api/v1/staff/submissions/:id` | Implemented |
| 3 | Review queue | Staff submissions list with server-side `SUBMITTED` status filter | Implemented |
| 3 | Revision decision | `POST /staff/submissions/:id/revision-requests` | Implemented |
| 3 | Start/final decisions | `POST /staff/submissions/:id/approve-start`, `/approve-final` | Implemented |
| 3 | Grade and amendment | `POST /staff/submissions/:id/grades` | Implemented |
| 3 | Attachment read | `GET /api/v1/files/:id/presign-read` | Implemented |
| 3 | Scoped reports | `GET /api/v1/reports/dashboard`, `GET /api/v1/reports/scoped` | Implemented |

## 5. Scope not represented as complete

The following v7 capabilities were not fabricated because Phase 2A does not expose the necessary production APIs:

- Faculty/supervisor account directory and CRUD.
- Enrollment creation and editing screens.
- Roster directory, import, export, and print workflow.
- Group creation, lifecycle commands, and distribution policies.
- Supervisor assignment create/update/end commands.
- Student draft creation/update and student-side submission composition.
- Dedicated persisted review task/notification model.
- Supervisor note creation.
- Case reassignment.
- Requirement-set and policy administration.
- Term-results read models and screens.
- Server-generated CSV exports and audit-log views.

These items are API gaps outside the approved Phase 2B migration scope. The frontend contains no mock substitute for them.

## 6. Files changed

### Updated

- `PORTAL_MIGRATION_MAP.md`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/vite.config.ts`

### Added

- `apps/web/src/api/client.ts`
- `apps/web/src/api/use-resource.ts`
- `apps/web/src/app/error-boundary.tsx`
- `apps/web/src/app/portal-app.tsx`
- `apps/web/src/auth/session.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/features/assignments/assignments-page.tsx`
- `apps/web/src/features/auth/login-page.tsx`
- `apps/web/src/features/catalogs/catalog-pages.tsx`
- `apps/web/src/features/dashboard/dashboard-page.tsx`
- `apps/web/src/features/reports/reports-page.tsx`
- `apps/web/src/features/students/students-page.tsx`
- `apps/web/src/features/submissions/submissions-page.tsx`
- `apps/web/src/routing/hash-router.ts`
- `apps/web/src/vite-env.d.ts`
- `tests/unit/frontend-production-boundary.test.ts`
- `PHASE_2B_MIGRATION_REPORT.md`

No source file under `apps/api`, `database`, or `packages` differs from the Phase 2A handoff baseline. The only additional files seen there during comparison were generated `dist` build outputs.

## 7. Verification executed

### Clean dependency installation

```text
npm ci
Result: PASS — 249 packages installed
```

### Frontend gate

```text
npm run build:packages
npm run typecheck --workspace @dentpilot/web
npm run lint --workspace @dentpilot/web
npm run build --workspace @dentpilot/web
Result: PASS
Vite: 42 modules transformed
Production JS: 241.35 kB (72.12 kB gzip)
Production CSS: 15.02 kB (4.10 kB gzip)
```

### Full repository compile gates

```text
npm run lint
npm run typecheck
npm run build
Result: PASS for all three commands
```

### Unit and production-boundary tests

```text
npm run test:unit
Result: PASS
Test files: 6 passed
Tests: 73 passed
```

The four new Phase 2B boundary tests verify:

1. No `window.PortalData`, `window.PortalPermissions`, `localStorage`, `sessionStorage`, `data.js` import, or `Math.random()` exists in production frontend source.
2. The API client uses cookie credentials and CSRF headers and consumes the typed session contract.
3. The migrated screens are wired to the approved catalog, student, group, assignment, submission, and report endpoints.
4. `STUDENT_INTEGRATION` is not offered staff navigation, while supervisor presentation routing remains explicit.

### Backend immutability check

The current `apps/api`, `database`, and `packages` source trees were compared against the Phase 2A handoff archive with `diff -qr`. Result: **PASS — no source differences**. Generated `dist` folders were excluded from the conclusion.

### Integration attempt

```text
docker --version
Result: FAIL — docker: command not found

npm run test:integration
Result: NOT RUNNABLE in this environment
Suites: 5 unavailable
Tests: 31 skipped during suite setup
Observed dependency error: ECONNREFUSED on MinIO port 9000
```

This result is not counted as an integration pass. PostgreSQL 16, MinIO, migration, seed, browser login, tenant isolation through the UI, workflow mutations, term lock, file lifecycle, and audit creation must still be exercised together on the Docker acceptance host.

## 8. Problems and decisions

| Item | Decision / result |
| --- | --- |
| Initial web-only TypeScript run could not resolve workspace contracts | The official root gate builds shared packages before checking the web workspace; local TypeScript errors in session and query serialization were corrected |
| First new boundary-test run had one incorrect string assertion | The assertion was corrected and the full 73-test suite passed afterward |
| No dedicated frontend permission DTO exists | Session role drives navigation hints; assignment permissions come from Backend DTOs; neither is treated as authorization authority |
| Review queue has no dedicated endpoint | Uses the approved scoped submissions endpoint with a server-side status filter; no local queue or state derivation was introduced |
| No Docker runtime | Integration and E2E acceptance remain explicitly pending |

## 9. Required next step

Run the unchanged project package on the Docker acceptance host:

```bash
npm ci
npm run infra:up
npm run db:migrate
npm run db:seed
npm run test:integration
npm run api:dev
npm run web:dev
```

Then execute browser acceptance for each role against seeded PostgreSQL data, including direct forbidden URLs, expired sessions, cross-tenant identifiers, supervisor assignment scope, illegal transitions, term lock, attachment read authorization, and audit creation.

## 10. Final assessment

The Phase 2B frontend implementation and compile/unit gates are complete. The project is **ready to enter Docker-backed acceptance**, but Phase 2B is **not yet End-to-End Complete** because the required UI → API → PostgreSQL/MinIO integration run could not be executed in this environment.
