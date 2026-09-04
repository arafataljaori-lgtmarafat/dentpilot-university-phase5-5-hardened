# DentPilot University — Phase 2A API Contract Report

## حالة التسليم

- تاريخ التحقق: 2026-09-02.
- النطاق: Backend API contracts وRead APIs وFile lifecycle وReport read models فقط.
- Frontend implementation: **لم يبدأ ولم تُعدّل ملفات مصدر `apps/web`**.
- حالة تنفيذ الكود ضمن نطاق Phase 2A: **مكتمل**.
- حالة بوابة API: **NO-GO / NOT READY**.
- سبب NO-GO الوحيد المعروف: لم تُشغّل اختبارات PostgreSQL 16 وMinIO فعليًا لأن بيئة التنفيذ لا تحتوي Docker أو خدمات محلية على `5432` و`9000`. لا يُعد وجود الاختبارات بديلًا عن نجاحها.

## فجوات API التي أُغلقت

### P0 — Session DTO contract

- أصبح `GET /api/v1/session` يعيد الحقول الخمسة المعلنة في `SessionActorDto`:
  - `accountId`
  - `organizationId`
  - `collegeId`
  - `role`
  - `departmentIds`
- أصبح `collegeId` من النوع `string | null` في principal والعقد، بما يطابق nullable database column.
- حُدّث OpenAPI ليجعل الحقول الخمسة مطلوبة ويمنع الحقول العلوية الإضافية.
- أضيف اختبار OpenAPI مستقل واختبار تكامل للجلسة الفعلية. اختبار OpenAPI نجح؛ اختبار التكامل لم يُنفّذ لغياب PostgreSQL/MinIO.

### P0 — Read APIs الأساسية

| Endpoint | DTO | الضبط الخادمي |
| --- | --- | --- |
| `GET /api/v1/catalog/departments` | `DepartmentDto[]` | RLS + account department scopes |
| `GET /api/v1/catalog/academic-years` | `AcademicYearDto[]` | RLS + authenticated catalog permission |
| `GET /api/v1/catalog/academic-levels` | `AcademicLevelDto[]` | RLS + authenticated catalog permission |
| `GET /api/v1/catalog/cohorts` | `CohortDto[]` | RLS + authenticated catalog permission |
| `GET /api/v1/groups` | `GroupDto[]` | department/year/level filters + account scopes |
| `GET /api/v1/students` | `StudentListDto` | server pagination/search/filter + role/department/year/level/cohort/group scope |
| `GET /api/v1/students/:id` | `StudentDetailDto` | identity + scoped enrollment history + scoped roster/group memberships |
| `GET /api/v1/supervisor-assignments` | `SupervisorAssignmentListDto` | University scope، Department scope، أو تكليفات المشرف نفسه |
| `GET /api/v1/staff/submissions` | `SubmissionListDto` | current submitted snapshots فقط + server pagination/filter + active assignment permission |
| `GET /api/v1/staff/submissions/:id` | `SubmissionDetailDto` | snapshot context، payload، decisions، revisions، grades، notes، attachments + server authorization |

تفاصيل الحماية الإضافية:

- لا يستطيع Department Admin استخدام Submission staff APIs لعدم امتلاكه `submissions:read` أو `cases:review`.
- لا يرى Clinical Supervisor إلا الطلاب والحالات المطابقة لتكليف فعّال، مع مراعاة group scope عند وجوده.
- لا يعيد Student Detail تسجيلات تاريخية خارج year/level/cohort/department scope بعد إثبات الوصول إلى الطالب.
- أصبح `supervisorAssignmentId` nullable في Submission DTO لأن قاعدة البيانات تسمح بالسجلات التاريخية غير المسندة؛ لا يمنح ذلك المشرف وصولًا دون تكليف.
- تبقى RLS هي حاجز organization، وتضيف الخدمات حواجز الدور والنطاق والتكليف فوقها.

### P0 — Typed OpenAPI responses

- أزيل `objectResponse` العام من مسارات API.
- نُقلت schemas إلى `apps/api/src/api-schemas.ts` لتكون مرجعًا واضحًا مستقلًا عن route handlers.
- لكل endpoint تحت `/api/v1` request/params/query/response schema صريح حسب الحاجة.
- كل DTO علوي يمنع `additionalProperties` غير المعلنة.
- الاستثناءان المقصودان فقط:
  - وثيقة `/openapi.json` ديناميكية بطبيعتها وليست DTO للبوابة.
  - `SubmissionDetailDto.payload` هو payload سريري versioned تحدده نسخة template المجمدة؛ المرونة محصورة داخل هذا الحقل وليست استجابة عامة.

### P1 — File lifecycle

أضيفت migration باسم `0002_phase2a_api_contract.sql`، وتشمل:

- enum لحالة الملف: `PENDING_UPLOAD` → `UPLOADED` → `LINKED`.
- `file_objects.status` و`file_objects.completed_at`.
- constraint يربط الحالة بوقت الاكتمال.
- backfill آمن للملفات المرتبطة سابقًا إلى `LINKED`.
- unique index يمنع ربط الملف بأكثر من attachment.

أضيفت المسارات:

| Endpoint | الوظيفة | الحماية |
| --- | --- | --- |
| `POST /api/v1/files/:id/complete` | تحميل object من MinIO والتحقق من content type وbyte size وSHA-256 قبل الانتقال | file creator فقط + CSRF + idempotency |
| `POST /api/v1/files/:id/attachments` | ربط ملف مكتمل بمسودة | Student Integration المالك للملف والمسودة فقط + CSRF + idempotency |

كما أُغلقت ثغرة خصوصية كانت تسمح لمسؤول الجامعة بقراءة ملف مرتبط بمسودة طالب غير مرسلة. القراءة الآن تكون للمالك، أو عبر snapshot مرسل مع `cases:review` ونطاق/تكليف كامل.

تنتج عمليات authorize/complete/link أحداث audit وoutbox داخل transaction نفسها:

- `FILE_UPLOAD_AUTHORIZED`
- `FILE_UPLOAD_COMPLETED`
- `FILE_ATTACHMENT_LINKED`

وعند إرسال المسودة:

- تُجمّد metadata المرفقات في `submission_snapshots.attachment_snapshot`.
- تنتقل attachment links من draft إلى snapshot داخل transaction نفسها.

### P1 — Report read models

| Endpoint | DTO | المحتوى |
| --- | --- | --- |
| `GET /api/v1/reports/dashboard` | `DashboardReportDto` | students، submissions، pending decisions، graded cases، active supervisors |
| `GET /api/v1/reports/scoped` | `ScopedReportDto` | صفوف أقسام مخولة مع counts وaverage grade |

- كلا المسارين يتطلب `academicYearId` ويقبل `departmentId` اختياريًا.
- Department Admin لا يرى إلا أقسام account scope المطابقة للسنة.
- لا تحتوي DTOs على student ID أو student name أو patient data.
- بقي `GET /api/v1/reports/aggregate` متوافقًا بعقد typed سابق.

## تغييرات DTO

أضيفت أو ثُبتت العقود التالية في `@dentpilot/contracts`:

- `SessionActorDto`
- `PageMetaDto`
- `DepartmentDto`
- `AcademicYearDto`
- `AcademicLevelDto`
- `CohortDto`
- `GroupDto`
- `StudentListItemDto`
- `StudentListDto`
- `StudentDetailDto`
- `EnrollmentSummaryDto`
- `EnrollmentDetailDto`
- `RosterMembershipDto`
- `GroupMembershipDto`
- `SupervisorAssignmentDto`
- `SupervisorAssignmentListDto`
- `SubmissionListItemDto`
- `SubmissionListDto`
- `SubmissionDetailDto`
- `RevisionRequestDto`
- `ClinicalDecisionDto`
- `GradeEventDto`
- `SupervisorNoteDto`
- `AttachmentDto`
- `DashboardReportDto`
- `DepartmentReportRowDto`
- `ScopedReportDto`
- `InvitationCreatedDto`
- `PresignUploadDto`
- `PresignReadDto`
- `FileCompletionDto`
- `AttachmentLinkDto`

## الاختبارات التي أضيفت أو وُسعت

### اختبارات الوحدة والعقود

- اكتمال كل Session field في OpenAPI.
- وجود كل endpoint جديد مع summary وsuccess response.
- منع generic top-level object success schemas لكل `/api/v1` route.
- file completion الناجح بعد مطابقة metadata.
- رفض completion عند اختلاف الحجم أو checksum.
- منع staff role من ربط attachment بمسودة طالب.
- منع University Admin من قراءة private draft attachment.
- الحفاظ على owner read وإخفاء الملفات عن الحسابات الأخرى.

النتيجة الفعلية:

```text
Test Files  5 passed (5)
Tests       69 passed (69)
```

### اختبارات التكامل المضافة

- Session response الفعلية مقابل DTO.
- catalogs/students/assignments/submissions list/detail من HTTP إلى PostgreSQL.
- منع Department Admin من staff submissions.
- قصر supervisor reads على active assignment.
- منع supervisor من list/detail لطالب خارج group scope حتى مع guessed ID.
- dashboard/scoped reports وغياب identity fields.
- file presign → MinIO PUT → completion verification → draft link → authorized read → DB state → audit events.
- clean migration يطبق كل ملفات migration بالترتيب ويثبت تسجيل `0001` و`0002`.

النتيجة الفعلية:

```text
Test Files  5 failed (5)
Tests       31 skipped (31)
سبب التوقف: ECONNREFUSED على PostgreSQL :5432 وMinIO :9000 قبل بدء حالات الاختبار.
```

لا تُحسب الحالات الـ31 نجاحًا أو فشلًا وظيفيًا؛ هي **غير منفذة** بسبب غياب التبعيات.

## الأوامر التي شُغلت فعليًا

| الأمر | النتيجة |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:unit` | PASS — 69/69 |
| `npm run build` | PASS — contracts/domain/config/api/web build |
| `npm audit --omit=dev` | PASS — `found 0 vulnerabilities` |
| `npm ls @fastify/static` | PASS — `@fastify/static@10.1.3` عبر `@fastify/swagger-ui@6.1.1` |
| `npm run infra:up` | NOT RUNNABLE — `docker: not found` |
| `MIGRATION_DATABASE_URL=... npm run db:migrate` | NOT RUNNABLE — `ECONNREFUSED :5432` |
| `SEED_DATABASE_URL=... npm run db:seed` | NOT RUNNABLE — `ECONNREFUSED :5432` |
| `npm run test:integration` | NOT RUN — 31 skipped بسبب فشل dependency setup |
| `npm run ci` | PARTIAL — lint/typecheck نجحا ثم توقفت البوابة عند integration dependency failure |

## Dependency security

- `npm audit --omit=dev`: صفر ثغرات.
- النسخة المحلولة من dependency محل المراجعة: `@fastify/static@10.1.3`.
- لا توجد نتيجة audit مفتوحة في شجرة production dependencies وقت هذا التقرير.

## ما بقي قبل بدء React migration

### Blocker وحيد لبوابة Phase 2A

يجب تشغيل الخطوات التالية من بيئة نظيفة تدعم Docker، ولا تتحول الحالة إلى API READY إلا إذا نجحت كلها:

```bash
npm ci
npm run infra:up
MIGRATION_DATABASE_URL=postgresql://dentpilot_migrator:...@localhost:5432/dentpilot npm run db:migrate
SEED_DATABASE_URL=postgresql://dentpilot_migrator:...@localhost:5432/dentpilot npm run db:seed
npm run test:integration
npm run ci
```

معيار القبول:

- PostgreSQL 16 وMinIO healthy.
- `0001_initial.sql` و`0002_phase2a_api_contract.sql` ينجحان من قاعدة فارغة.
- seed ينجح.
- 31/31 integration tests تنفذ وتنجح دون skipped tests.
- clean migration وRLS tenant isolation وfile lifecycle وAPI authorization كلها PASS.

### وظائف لاحقة لا يجوز إعلانها موجودة

لم يضف هذا sprint وظائف غير مطلوبة ضمن Phase 2A. تبقى API gaps التالية لوحداتها اللاحقة كما سجلتها `PORTAL_MIGRATION_MAP.md`:

- Faculty/account administration read/write lifecycle.
- Rosters list/detail/import/export.
- Groups lifecycle وdistribution policy management خارج read/list وmembership command الموجود.
- Supervisor assignment create/update/end/reassign commands.
- Student create/archive/reactivate وEnrollment create transitions.
- Student draft create/update/read: نُفِّذ في Phase 2D (`/api/v1/student/drafts`). الإرسال الفعلي لطلب تعديل (resubmission chaining عبر `resubmission_of_snapshot_id`) يبقى غير منفَّذ — `submitDraft` ينشئ case_sheet جديدًا مستقلًا في كل مرة، لا سلسلة مرتبطة بالسابق.
- Dedicated review queue، supervisor note command، case reassignment.
- Requirement/policy management APIs.
- Term Results list/detail/history/readiness.
- Server-generated CSV exports وscoped audit views.

لا يجب أن تعرض الواجهة أيًا من هذه الوظائف كميزة مكتملة قبل تنفيذ endpoint وعقد واختبارات التكامل الخاصة بها.

## الحكم النهائي

**NO-GO لبدء React migration الآن.**

لا يوجد blocker برمجي معروف في نطاق Phase 2A بعد مراجعة الكود ونجاح static/unit/build/audit gates، لكن بوابة القبول الرسمية تظل مغلقة لأن migration/seed/integration لم تُشغّل فعليًا على PostgreSQL 16 وMinIO. بعد نجاح التشغيل النظيف المذكور أعلاه يمكن تغيير الحكم إلى **API READY / GO** دون تعديل Frontend قبل ذلك.
