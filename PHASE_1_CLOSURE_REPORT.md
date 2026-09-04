# DentPilot University — Phase 1 Closure Report

**التاريخ:** 2026-09-01  
**نطاق القرار:** Production Core Phase 1 فقط  
**بوابة القبول:** Phase 1 Closure Fix Sprint  
**الحكم النهائي:** **GO للانتقال إلى تخطيط Phase 2**  

لم يبدأ Phase 2، ولم تبدأ Migration للواجهة، ولم تُضف Features خارج إغلاق الحالة المعلنة أصلًا في Phase 1. جميع P0 وP1 blockers الواردة في بوابة القبول أُغلقت واختُبرت فعليًا.

## النتيجة المختصرة

| الأولوية | Blocker | الإصلاح | دليل القبول | الحالة |
| --- | --- | --- | --- | --- |
| P0 | migration مكررة/غير قابلة للبدء من الصفر | إزالة `student_id` وactive-membership index المكررين، وإضافة clean-migration test | migration على PostgreSQL 16 من قاعدة فارغة + 3/3 اختبارات migration | مغلق |
| P0 | application user يتجاوز RLS | فصل owner/migrator/app، وإلزام `dentpilot_app` بـ`NOSUPERUSER NOBYPASSRLS` و`FORCE RLS` | role-attribute assertions + قراءة cross-tenant فعلية تُرجع صفر صفوف | مغلق |
| P0 | تفويض endpoints الحساسة ناقص | full academic scope مشتق خادميًا، active/effective assignment، University-only invitations، multi-department close guard | authorization matrix + HTTP negative tests + real expired-assignment test | مغلق |
| P0 | مصدران لحالة الحالة الأكاديمية وقفل غير شامل | `case_sheets.current_status` مصدر وحيد، domain state machine واحدة، service + DB term-lock guards | رفض grade قبل الاعتماد، رفض transition المتجاوز، منع amendment بعد lock | مغلق |
| P0 | ثغرة `@fastify/static` | ترقية `@fastify/swagger-ui` إلى 6.1.1 و`@fastify/static` إلى 10.1.3 | `npm audit --omit=dev`: صفر ثغرات | مغلق |
| P1 | فرق بين الوثائق والـAPI | حصر API الفعلية وإظهار foundations غير المكشوفة كـAPI | OpenAPI contract tests + تحديث mapping/contract/limitations | مغلق |
| P1 | عدم تشغيل البنية والتكامل فعليًا | تشغيل PostgreSQL 16.15 وMinIO ثم migration/seed/integration | 25/25 integration و`/health/ready` = 200 | مغلق |

## P0-1 — PostgreSQL migration

### ما تم إصلاحه

- إزالة الإضافة الثانية للعمود `accounts.student_id`.
- إزالة الفهرس الجزئي المكرر لعضوية المجموعة الفعالة والإبقاء على قيد واحد واضح.
- إضافة الحقول المطلوبة للسياق الأكاديمي (`term_id`) و`case_sheets.revision` داخل migration الأصلية بصورة متسقة.
- تحديث runner ليطلب `MIGRATION_DATABASE_URL` صراحة ولا يقبل runtime credential ضمنيًا.
- إضافة `tests/integration/clean-migration.test.ts`؛ ينشئ قاعدة مؤقتة فارغة، يطبق `0001_initial.sql` كاملًا، يفحص العناصر المكررة، ثم يحذف القاعدة.

### الإثبات

- PostgreSQL: `16.15`.
- `npm run db:migrate`: `Applied 0001_initial.sql` على قاعدة فارغة.
- `npm run db:seed`: `Deterministic development seed applied.`
- `npm run test:migration`: **3/3 passed**.

## P0-2 — PostgreSQL security model

### ما تم إصلاحه

- `dentpilot_owner`: تهيئة/ملكية بيئة التطوير فقط.
- `dentpilot_migrator`: migration وseed فقط، منفصل عن runtime.
- `dentpilot_app`: runtime فقط، مع `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`.
- migration يفشل مغلقًا إذا لم يوجد `dentpilot_app` أو كان `SUPERUSER/BYPASSRLS`.
- تفعيل `FORCE ROW LEVEL SECURITY`، بما في ذلك جدول `organizations`، وسحب الوصول إلى `schema_migrations` من التطبيق.
- فصل URLs في `.env.example` وDocker initialization وrunbook.

### الإثبات

- فحص `pg_roles`: `rolsuper=false` و`rolbypassrls=false` لحساب التطبيق.
- اختبار حقيقي أدخل مؤسستين بحساب migration ثم قرأ بحساب التطبيق تحت `app.organization_id`؛ ظهرت المؤسسة المطلوبة فقط.
- اختبار HTTP خمن snapshot من tenant آخر وحصل على `404`، لا بيانات ولا side channel مباشر.

## P0-3 — Authorization

### الحدود المطبقة

- لا تُقبل role/tenant/department/student context من العميل بوصفها سلطة؛ السياق الفعلي يُقرأ من PostgreSQL.
- account scopes تغطي: department، academic year، academic level، cohort.
- supervisor assignment يتطلب: assignment id مطابق، supervisor مطابق، `ACTIVE`، effective date سارية، department/year/level/cohort/group مطابق، وpermission ممنوحة.
- enrollment close يفحص كل الأقسام المرتبطة بالروسترات الفعالة، وليس قسمًا واحدًا أو role فقط.
- group membership يشتق department/year/level/cohort/student من group + enrollment ويتحقق من تطابق body قبل التنفيذ.
- invitations محصورة في `UNIVERSITY_ADMIN`.
- term-result commands محصورة في `UNIVERSITY_ADMIN` في Phase 1.
- file reads تتطلب owner أو University Admin أو reviewer assignment ساريًا بكامل السياق.

### الإثبات

- **48/48** authorization matrix tests.
- رفض Department Admin إصدار invitation.
- رفض Department Admin إغلاق enrollment مرتبط أيضًا بقسم خارج نطاقه، وبقاء التسجيل `ACTIVE`.
- رفض supervisor assignment منتهي زمنيًا.
- رفض حقول query غير المعلنة مثل client-supplied role بـ`400 VALIDATION_ERROR`.

## P0-4 — Academic State Model

### المصدر الوحيد

`case_sheets.current_status` هو مصدر الحالة الحالية الوحيد. `submission_snapshots` سجلات تاريخية immutable ولا تحمل current status ثانية. القراءة والتقارير والقرارات والدرجات ترجع إلى الحالة نفسها.

### state machine المطبقة

`SUBMITTED → REVISION_REQUESTED | APPROVED_START → APPROVED_FINAL → GRADED`

- approval/revision/grade تستخدم `assertSubmissionTransition` نفسها.
- grade أولى لا تُقبل إلا من `APPROVED_FINAL`.
- amendment تتطلب بقاء الحالة `GRADED` وسببًا.
- `term_result_closures=LOCKED` يمنع approval/revision/grade/amendment في service وفي database triggers.

### الإثبات

- grade على `SUBMITTED`: `409 ILLEGAL_TRANSITION`.
- approve-final قبل approve-start: `409 ILLEGAL_TRANSITION`.
- التسلسل الصحيح حتى `GRADED`: ناجح، والقراءة أعادت `GRADED`.
- amendment بعد `LOCKED`: `409 ILLEGAL_TRANSITION`.

## P0-5 — Dependency security

- `@fastify/swagger-ui`: **6.1.1**.
- `@fastify/static`: **10.1.3**.
- `npm audit --omit=dev --json`: info 0، low 0، moderate 0، high 0، critical 0؛ الإجمالي **0**.

## P1-6 — تطابق الوثائق والـAPI

- تحديث `docs/architecture/api-contract.md` ليحتوي كل routes الفعلية، بما فيها approve-start/approve-final، والسلطات الفعلية.
- تحديث `docs/architecture/v7-to-production-mapping.md` لتمييز API المنفذة عن schema foundations.
- إزالة ادعاءات import/export، faculty management، assignment management، assessment، settings، CSV export، file completion، وoutbox publishing غير الموجودة.
- تحديث state-machine/data/security/runbook/known-limitations documents.
- OpenAPI contract test يثبت وجود المسارات الحساسة المعلنة ويمنع drift في العقود.

## P1-7 — التشغيل الفعلي من بيئة نظيفة

### الخدمات

- PostgreSQL **16.15** على قاعدة جديدة فارغة.
- MinIO من source tag الرسمي `RELEASE.2024-01-18T22-51-28Z`، commit `19387cafab76133c2e7642de4aac8c81b9f4f8c7`.
- بيئة التنفيذ تمنع netlink interface discovery؛ لذلك بُني MinIO للاختبار خارج المشروع مع fallback إلى `127.0.0.1` عند فشل `net.Interfaces()`. لم يتغير S3 signing/storage behavior، ولم يدخل هذا binary أو patch في التسليم.
- migration ثم seed ثم tests شُغلت بعد إنشاء قاعدة جديدة.
- فُكت الحزمة المرشحة في مجلد خالٍ، ثم نجحت منها `npm ci` وlint/typecheck/unit/build، وبعد إعادة إنشاء القاعدة نجحت integration كاملة من الحزمة المفكوكة نفسها.

### نتائج الاختبارات

| البوابة | النتيجة |
| --- | --- |
| Unit tests | **63/63 passed** |
| Integration tests | **25/25 passed** |
| Clean migration subset | **3/3 passed** (مشمولة في integration) |
| Full test run | **88/88 passed**, 9/9 files |
| Lint | passed |
| Typecheck | passed |
| Build | passed |
| PostgreSQL readiness | passed |
| MinIO readiness + private signed upload/read | passed |
| Dependency audit | **0 vulnerabilities** |

اختبار التخزين أثبت أيضًا أن تغيير `Content-Type` الموقّع يرفض الطلب، وأن `Content-Length` وSHA-256 checksum مطلوبان، وأن القراءة المباشرة غير الموقعة مرفوضة.

## الأوامر التي شُغلت

تم تمرير URLs/credentials عبر environment variables ولم تُسجل قيم الإنتاج. الأوامر الجوهرية:

```bash
/usr/lib/postgresql/16/bin/postgres --version
minio --version
npm ci
npm run db:migrate
npm run db:seed
npm run test:migration
npm run test:integration
npm run test:unit
npm run ci
npm ls @fastify/swagger-ui @fastify/static --all
npm audit --omit=dev --json
```

## Blockers المفتوحة وترتيب الأولويات

لا توجد Phase 1 blockers مفتوحة. البنود المتبقية في `docs/operations/known-limitations.md` (malware scanning، upload completion/orphan cleanup، outbox publisher، multi-key session rotation، وقرارات backup/retention/monitoring) محددة صراحة كحدود تشغيلية أو نطاقات لاحقة، وليست ادعاءات Features منجزة ولا تمنع بدء Phase 2 وفق بوابة القبول الحالية.

## قرار الانتقال

**GO** للانتقال إلى Phase 2 بعد اعتماد هذا التقرير. لا يلزم إصلاح إضافي قبل Migration للواجهة من جهة Phase 1 Core. يجب أن يبدأ Phase 2 كتغيير مستقل بbaseline لهذه الحزمة وبدون إعادة فتح state/security invariants إلا عبر ADR واختبارات regression.
