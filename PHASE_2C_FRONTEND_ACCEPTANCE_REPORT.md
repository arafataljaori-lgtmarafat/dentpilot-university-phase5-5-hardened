# DentPilot University — Phase 2C Frontend Acceptance Report

## 1. Acceptance decision

**NEEDS FIXES**

The Frontend hardening code, clean dependency installation, compilation, unit tests, workflow adapter tests, dependency audit, and production asset serving all passed. Production acceptance is not closed because this environment does not provide Docker, PostgreSQL 16, MinIO, or a browser connected to the live Production Core. The required UI → API → PostgreSQL/MinIO workflow evidence therefore could not be produced.

This decision does not identify a remaining Frontend compile or unit-test failure. It identifies two unclosed acceptance requirements:

1. Run all integration suites against PostgreSQL 16 and MinIO.
2. Run browser workflow tests for every role against the live API and verify the runtime console.

## 2. Scope and architectural result

Phase 2B was hardened without rebuilding the interface, changing Backend Core, changing API contracts, or adding business rules to React.

| Area | Result |
| --- | --- |
| Component organization | Preserved feature-based structure under `apps/web/src` |
| State management | Server data remains request-scoped; session stays in React memory; UI-only state remains local |
| API client | Typed Phase 2A client retained and hardened |
| Authentication | Cookie session restore/login/logout retained; network failures no longer impersonate anonymous state |
| Error boundaries | Render failure boundary retained and made accessible without production console output |
| Authorization | No client permission matrix; authenticated routes are display navigation only; Backend remains authoritative |
| API contracts | Unchanged |
| Backend Core | Unchanged |

Source comparison against the Phase 2B handoff confirmed no source differences under:

- `apps/api`
- `database`
- `packages`

Generated `dist` output was excluded from the source comparison.

## 3. Completed pages and workflows

| Page / workflow | Frontend status | Backend APIs used |
| --- | --- | --- |
| Login | Complete | `POST /api/v1/auth/login` |
| Session restore/logout | Complete | `GET /api/v1/session`, `POST /api/v1/auth/logout` |
| Dashboard | Complete | Dashboard/scoped reports and catalogs |
| Students | Complete for list and detail contracts | `GET /api/v1/students`, `GET /api/v1/students/:id` |
| Departments | Complete | `GET /api/v1/catalog/departments` |
| Academic years, levels, cohorts | Complete | Phase 2A catalog APIs |
| Groups | Complete | `GET /api/v1/groups` |
| Supervisor assignments | Complete for list/read workflow | `GET /api/v1/supervisor-assignments` |
| Submissions | Complete for staff list/detail | Staff submission list/detail APIs |
| Review workflow | Complete for the available contracts | Revision request and approval APIs |
| Decision workflow | Complete | Approve-start and approve-final APIs |
| Grading workflow | Complete | Grade/amend command API |
| Reports | Complete for dashboard and scoped read models | Dashboard/scoped report APIs |
| Attachment read | Complete | Presigned-read API |

“Complete” in this table means implemented against the approved Phase 2A contract and passing compile/client-adapter tests. It does not replace the pending Docker-backed end-to-end evidence.

## 4. Problems fixed in Phase 2C

### Session and authentication

- A network failure during session restoration previously collapsed into the anonymous/login state. It now renders an explicit recoverable API error state.
- Logout previously cleared the local session even when the Backend logout request failed. It now removes privileged content and shows a recoverable error state until the server session can be checked again.
- HTTP 401 still invalidates the in-memory principal immediately.

### API client

- Added a 20-second request timeout.
- Added `Accept: application/json`.
- Added `cache: no-store` for confidential dynamic API requests.
- Preserved `credentials: include` and mutation CSRF headers.
- Added explicit `NETWORK_ERROR`, `REQUEST_TIMEOUT`, and `INVALID_RESPONSE` normalization.
- Successful non-204 responses that violate the JSON contract now fail visibly instead of leaking a raw parsing exception.
- Caller-provided abort signals are propagated.

### Authorization boundary

- Removed the hardcoded role-to-navigation permission matrix.
- Routes are gated only by authenticated session presence for display purposes.
- Every screen still calls the Backend, and 403 remains the actual authorization result.
- Clinical action visibility uses assignment permissions returned by the Backend DTO; it does not grant authority.
- No state transition, tenant rule, role grant, scope rule, or grade eligibility rule was added to React.

### Error handling and accessibility

- Added differentiated messages for network errors, 401, 403, 404, 409, and 429.
- Added validation-detail rendering and preserved request IDs.
- Added `aria-live`, `aria-current`, status labels, explicit button types, and alert semantics.
- Added route-change focus management for keyboard and screen-reader users.
- Added Escape-key closing for the responsive menu and `aria-expanded` state.
- Added a styled fatal render-error screen.
- Removed production `console.log`, `console.warn`, and `console.error` calls from Frontend source.

### Defensive navigation and files

- Malformed hash-route encoding no longer crashes route parsing.
- Presigned attachment URLs are restricted to HTTP/HTTPS before rendering as clickable links.
- Added `referrer=same-origin` metadata.

### Environment and responsive behavior

- Added `apps/web/.env.example` for `VITE_API_BASE_URL`.
- Empty `VITE_API_BASE_URL` keeps the recommended same-origin production configuration.
- The existing 980 px and 680 px responsive layouts, mobile sidebar, dense tables, and one-column clinical detail behavior were preserved.

## 5. Prototype-removal verification

The production Frontend source was scanned for the following and no match was found:

- `window.PortalData`
- `window.PortalPermissions`
- `localStorage`
- `sessionStorage`
- `mockData`
- fake API flows
- demo flows
- role-based `roles:` permission arrays
- `Math.random()` record identifiers
- production console statements

The v7 files remain reference material only and are not imported by `apps/web`.

## 6. Workflow test results

### Frontend workflow adapter tests

`tests/unit/frontend-api-client.test.ts` tests nine workflows:

1. Login
2. Dashboard
3. Student management read flow
4. Supervisor assignments
5. Submission list flow
6. Review/revision flow
7. Approval decision flow
8. Grading flow
9. Reports

For every workflow, the suite verifies:

- Successful request path.
- Unauthorized response: 401 for Login and 403 for protected workflows.
- Server error response without optimistic success.

Additional tests verify:

- Cookie credentials and CSRF propagation.
- In-memory session invalidation after 401.
- Network failure normalization.
- Invalid successful JSON response rejection.

Result:

```text
tests/unit/frontend-api-client.test.ts: 30 passed
```

These are Frontend adapter tests with controlled `fetch` responses. They prove request/error behavior in the client layer; they are not presented as live Backend integration tests.

### Full unit gate

```text
npm run test:unit
Test files: 7 passed
Tests: 103 passed
Result: PASS
```

The total includes the existing authorization, state-machine, files, idempotency, and API contract tests, plus the Phase 2B production-boundary tests and Phase 2C workflow adapter tests.

### Live integration attempt

```text
docker --version
Result: docker: command not found

npm run test:integration
Result: NOT PASSED
Suites unavailable: 5
Tests skipped during suite setup: 31
Observed dependency failure: ECONNREFUSED on MinIO port 9000
```

The unavailable suites cover API security, clean migration/RLS, PostgreSQL invariants, object storage, and file lifecycle. Their skipped state is not counted as success.

## 7. Production build and dependency results

A fresh project copy without `node_modules`, `dist`, or coverage output was used for the clean gate:

```text
npm ci                         PASS — 249 packages installed
npm run lint                   PASS
npm run typecheck              PASS
npm run test:unit              PASS — 103/103
npm run build                  PASS
```

Production Frontend output:

```text
42 modules transformed
index.html                     0.52 kB / 0.32 kB gzip
CSS                            15.42 kB / 4.17 kB gzip
JavaScript                     242.26 kB / 72.64 kB gzip
```

Production Preview asset check:

```text
GET /                          HTTP 200
index.html                     520 bytes
JavaScript asset               242,257 bytes
CSS asset                      15,416 bytes
```

Dependency security:

```text
npm audit --omit=dev           0 vulnerabilities
npm audit                      0 vulnerabilities
```

Performance basics are acceptable for the current portal size: one 72.64 kB gzip JavaScript bundle, one 4.17 kB gzip stylesheet, no runtime prototype payload, and no external font request. Route-level code splitting remains an optional optimization rather than a current build blocker.

## 8. Files changed in Phase 2C

### Added

- `apps/web/.env.example`
- `tests/unit/frontend-api-client.test.ts`
- `PHASE_2C_FRONTEND_ACCEPTANCE_REPORT.md`

### Updated

- `apps/web/index.html`
- `apps/web/src/api/client.ts`
- `apps/web/src/app/error-boundary.tsx`
- `apps/web/src/app/portal-app.tsx`
- `apps/web/src/auth/session.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/features/submissions/submissions-page.tsx`
- `apps/web/src/routing/hash-router.ts`
- `apps/web/src/styles.css`
- `tests/unit/frontend-production-boundary.test.ts`

## 9. Remaining acceptance work

The following must run on the real acceptance host before changing the decision to `READY FOR PRODUCTION`:

```bash
npm ci
npm run infra:up
npm run db:migrate
npm run db:seed
npm run test:integration
npm run api:dev
npm run web:dev
```

Browser acceptance must then execute success, error, and forbidden paths for Login, Dashboard, Students, Supervisor assignments, Submissions, Reviews, Decisions, Grading, Reports, session expiry, attachment authorization, illegal transitions, term lock, cross-department identifiers, and cross-organization identifiers.

The browser run must also confirm:

- No runtime console errors.
- Secure production cookies and HTTPS.
- Correct production CORS origin.
- Reverse-proxy security headers, including CSP, frame protection, MIME sniffing protection, and an appropriate referrer policy.
- No stale privileged content after logout, 401, role change, or assignment-scope change.

## 10. Final statement

Phase 2C Frontend hardening is complete at source, clean-build, unit, workflow-adapter, dependency, and production-asset levels. The project remains **NEEDS FIXES** only because the mandatory live Production Core and browser acceptance evidence is unavailable in this environment. No production readiness claim is made without that run.
