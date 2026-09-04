# ARCHITECTURE_BOUNDARY_DOCUMENT

**النطاق:** DentPilot University — مراجعة حدود معمارية (Architecture Boundary & System-of-Record Review)
**الطريقة:** قراءة كود فعلي (`apps/api/src`, `packages/*`, `database/migrations`) لا اعتمادًا على أسماء الملفات أو التوثيق فقط.
**الإعداد:** Principal Software Architect review — تحليل وتوثيق بلا تعديل كود.

---

## 1. System Overview

DentPilot University Core هو **modular monolith** مكتوب بـ TypeScript، بمعمارية:

```
apps/api   → Fastify API (System of Record — كل business logic والقرارات الحساسة)
apps/web   → React SPA "University Portal" (Admin / Department Admin / Supervisor فقط)
packages/domain    → قواعد transitions/invariants صِرفة، بلا I/O، تُستهلك من apps/api فقط
packages/contracts → DTOs/أنواع مشتركة (Zod-adjacent shapes)، بلا business logic
packages/config    → تحقق env عبر Zod
database/migrations → PostgreSQL 16 + Row-Level Security إجباري (FORCE RLS) على كل جدول مستأجر
```

هذا يطابق ADR 001 (`docs/adr/001-modular-monolith.md`) وADR 002 (PostgreSQL كـ system of record). لم يُكتشف أي انحراف عن هذا القرار في الكود الفعلي.

**نقطة جوهرية للمراجعة:** لا يوجد اليوم تطبيق "Student App" داخل هذا الـ repo. `apps/web` هو **بوابة الموظفين فقط** — لا يحتوي أي مسار أو feature موجّه للطالب (تحقّق: `apps/web/src/features/` يضم فقط `assignments, auth, catalogs, dashboard, reports, students, submissions` وكلها مبنية على principal موظف). الفصل بين "Student App مستقل" و"University Core" ليس نية مستقبلية فقط — هو **حدود مطبّقة فعليًا في الكود الحالي**: يوجد role كامل باسم `STUDENT_INTEGRATION` مُجهَّز لهذا الغرض تحديدًا (انظر §5).

---

## 2. Application Boundaries

```
┌─────────────────────┐        ┌──────────────────────────┐
│  DentPilot Student   │        │   DentPilot University   │
│  App (غير موجود بعد   │──API──▶│   Portal (apps/web)      │
│  في هذا الـ repo)     │        │   Admin / Dept Admin /    │
│                      │        │   Supervisor UI فقط        │
└─────────────────────┘        └──────────────┬────────────┘
           │                                    │
           │ principal: STUDENT_INTEGRATION     │ principal: UNIVERSITY_ADMIN /
           │ (نطاق: طالب واحد مملوك)             │ DEPARTMENT_ADMIN / CLINICAL_SUPERVISOR
           ▼                                    ▼
      ┌──────────────────────────────────────────────┐
      │        apps/api (Fastify) — System of Record   │
      │  Auth · Authorization · Domain rules · Audit    │
      └──────────────────────┬───────────────────────┘
                              ▼
                 PostgreSQL 16 + FORCE ROW LEVEL SECURITY
                 (عزل tenant إجباري على مستوى القاعدة، ليس فقط التطبيق)
```

**الحد الحاسم:** كِلا العميلين (Student App مستقبلًا، وWeb Portal حاليًا) هما **عميلان لنفس الـ API**، لا مالكان لبيانات أو منطق. لا توجد قاعدة بيانات مستقلة، لا Local Storage كبديل لمصدر رسمي، ولا نسخة من business logic خارج `apps/api` و`packages/domain`. هذا تحقق كودي، وليس نية معلنة فقط:
- `apps/web/package.json` لا يعتمد على `@dentpilot/domain` إطلاقًا (تحقّق مباشر: لا استيراد له في `apps/web/src/`) — فقط `@dentpilot/contracts` (أنواع DTO مشتركة بلا سلوك).
- كل decision منطقي (state transitions, optimistic locking, immutability) موجود حصرًا في `packages/domain/src/index.ts` ويُستدعى من `apps/api/src/modules/*/service.ts` فقط.

---

## 3. Data Ownership

**System of Record وحيد:** PostgreSQL، عبر `apps/api`. لا يوجد أي مسار كتابة بديل.

**عزل المستأجر (Tenant Isolation) — مُطبَّق على مستوى القاعدة وليس فقط الكود:**
`database/migrations/0001_initial.sql` يُفعِّل `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` على كل جدول مملوك لمؤسسة (٣٩ جدولًا)، مع policy واحدة:
```sql
CREATE POLICY tenant_isolation ON <table>
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);
```
و`Database.withTenant()` (`apps/api/src/infrastructure/db.ts`) يضبط `app.organization_id` داخل كل transaction من الـ session الخادمية فقط — لا من أي مدخل عميل. هذا يعني أن Student App **مستقبلًا** لن يستطيع، حتى عبر ثغرة في route، قراءة أو كتابة بيانات مؤسسة أخرى: القاعدة نفسها ترفض ذلك (`FORCE ROW LEVEL SECURITY` يمنع حتى مالك الجدول من التحايل). هذا أقوى من عزل على مستوى التطبيق فقط، وهو قرار معماري صحيح يحمي أي عميل مستقبلي بلا حاجة لثقة إضافية فيه.

**الطبقة الثانية — ملكية داخل نفس المؤسسة:** `account_scopes` وAuthorizationService (§5) يضيفان عزلًا أدق (قسم/سنة/مستوى/فوج) فوق عزل RLS الأساسي.

**خلاصة:** DentPilot University هو فعليًا الـ **System of Record** الوحيد للبيانات الأكاديمية الرسمية. لا يوجد أي مسار حالي أو مخطَّط يسمح بتخزين بيانات رسمية خارج هذا المصدر.

---

## 4. Domain Ownership

| الكيان (Entity) | من يملكه (Table owner) | من يقرأ | من يكتب/يقرر | ملاحظات حدّية |
|---|---|---|---|---|
| Student | `students` | Staff (نطاق قسم/سنة) | University Admin (إنشاء/أرشفة — **غير منفَّذ بعد**، انظر الفجوات) | Student App لا يقرأ سجل الطالب الإداري الكامل، فقط عبر session الخاص به |
| Academic Enrollment | `academic_enrollments` | Staff | University/Department Admin | إغلاق enrollment منفَّذ (`closeEnrollment`)، الإنشاء غير منفَّذ بعد |
| Supervisor Assignment | `supervisor_assignments` + `_permissions` | Staff (نطاق) + المشرف نفسه ضمنيًا | University/Department Admin | القراءة فقط منفَّذة حاليًا (`AssignmentsService.list`)؛ create/update/end غير منفَّذ |
| Case Sheet / Draft | `case_sheets`, `student_drafts` | Staff (بعد التقديم فقط)، الطالب المالك (قبل وبعد) | **الطالب المالك حصريًا قبل التقديم** | راجع §6 — لا يوجد endpoint لإنشاء/تعديل draft حاليًا رغم وجود الجدول |
| Submission Snapshot | `submission_snapshots` | Staff بنطاق cases:review + الطالب المالك (قراءة الحالة) | **غير قابل للتعديل بعد الإنشاء** (immutable) | `submitDraft` يحوّل draft → snapshot عبر `sequence` تصاعدي و`resubmission_of_snapshot_id`؛ هذا يطابق ADR 006 (Immutable Submissions) |
| Revision Request / Clinical Decision | `revision_requests`, `clinical_decisions` | Staff + الطالب (نتيجة فقط) | Supervisor (بصلاحية `reviewCases` على assignment نشِط ومحدد النطاق) | التفويض هنا **ليس دورًا عامًا** بل مرتبط بـ assignment فعلي (`supervisor_assignment_permissions`) — دقيق جدًا |
| Grade Event | `grade_events` | Staff + الطالب (نتيجة منشورة) | Supervisor بصلاحية `grade` | تعديل الدرجة (`AMENDED`) يفرض `reason` إجباري (`assertGradeAmendment`) |
| Requirement / Grading Policy / Workflow Policy (كل `*_versions`) | جداول policy منفصلة بحالة `DRAFT/PUBLISHED/ARCHIVED` | Staff، وSnapshot يرتبط بنسخة منشورة محددة | University/Department Admin | Versioning صريح (`assertPublishedVersionImmutable`) — يمنع تعديل نسخة منشورة بأثر رجعي؛ إدارة هذه السياسات (نشر/تحرير) **غير منفَّذة بعد كـ API** |
| Term Result Closure | `term_result_closures` | Staff (نطاق) | University Admin (transition عبر state machine REVIEWED→APPROVED→LOCKED→REOPENED) | القرار النهائي دائمًا داخل Core، لا مكان آخر |
| Audit Event | `audit_events` (append-only، trigger يمنع UPDATE/DELETE حسب ADR 007) | Staff بصلاحية مناسبة | النظام تلقائيًا مع كل mutation | لا يوجد أي مسار حذف أو تعديل — هذا صحيح لسجل تدقيق |
| File Object / Attachment | `file_objects`, `attachments` | مالك الملف + من له حق مراجعة الـ snapshot المرتبط | صاحب الملف (upload) والطالب المالك (ربط بمسودته فقط) | راجع §7 |

**الحكم:** ملكية كل كيان أكاديمي رسمي (enrollment, roster, group, requirement, grade, term result, audit) **مركزية بالكامل داخل University Core**. لا يوجد كيان واحد تُتَّخذ قراراته النهائية خارج `apps/api`. هذا يطابق تمامًا الهدف المعماري المطلوب في البرومبت المرفق.

---

## 5. Authentication Model

- **الجلسة:** cookie مُوقَّعة عشوائيًا (`dp_session` = `organizationId.token`)، `httpOnly`, `SameSite=strict`, ومدتها 8 ساعات. التحقق عبر hash للـ token في جدول `sessions` (لا JWT قابل لفك التشفير من العميل — كل شيء opaque ويُتحقق منه server-side).
- **CSRF:** cookie منفصل غير httpOnly (`dp_csrf`) يجب إرساله كـ header `x-csrf-token` في كل mutation، ويُتحقق منه ضد hash مخزَّن. هذا نمط صحيح لعميل متصفح.
- **الدور المُعَدّ مسبقًا لتكامل الطالب:** `Principal.role` يتضمن بالفعل قيمة `STUDENT_INTEGRATION` (وليس دورًا مضافًا افتراضيًا) مع حقل `studentId` اختياري على الـ Principal نفسه (`apps/api/src/security/auth.ts:8`). هذا **دليل كودي** أن تصميم الالتحام مع Student App كان حاضرًا منذ التصميم الأول لنموذج الهوية، لا أنه إضافة لاحقة.
- **فجوة حقيقية يجب إغلاقها قبل الربط الفعلي:** `redeemInvitation()` (`auth.ts:63`) يُنشئ حساب `INSERT INTO accounts(organization_id,college_id,email,password_hash,status,primary_role)` — **بلا `student_id`**. أي أن مسار تزويد الحسابات الحالي لا يربط حساب `STUDENT_INTEGRATION` بسجل طالب فعلي رغم وجود العمود (`accounts.student_id`) في المخطط. هذا موثَّق بالفعل ذاتيًا في `docs/operations/known-limitations.md` (البند 4) وليس اكتشافًا مخفيًا — لكنه **يمنع تشغيل Student App فعليًا اليوم** إلى أن يُبنى مسار تزويد صريح.
- **نموذج CORS الحالي أحادي المصدر:** `CORS_ORIGIN` في `packages/config` هو `z.string().url()` — قيمة واحدة فقط، مصمَّم لعميل متصفح واحد (البوابة). دخول Student App كعميل بمصدر (origin) مختلف — سواء ويب منفصل أو WebView — يتطلب **قرارًا تصميميًا صريحًا** (قائمة مصادر مسموحة، أو مسار مصادقة بديل بدون cookies لعملاء غير متصفح). هذا ليس عيبًا في الحدود المعمارية، لكنه قرار غير مُتَّخذ بعد ويجب حسمه قبل التنفيذ (تفصيل في `STUDENT_APP_INTEGRATION_PLAN.md`).

---

## 6. Authorization Model

RBAC + Scope-based + Assignment-based، بالكامل server-side (`apps/api/src/security/authorization.ts`):

1. **صلاحيات الدور الأساسية** (`rolePermissions`): كل دور له مجموعة صلاحيات ثابتة. **`STUDENT_INTEGRATION` محدود إلى `catalogs:read` و`files:access` فقط** — لا صلاحية إدارية واحدة. هذا يحقق مباشرة الشرط المطلوب في البرومبت: *"Student App لا يمتلك صلاحيات إدارية."*
2. **نطاق أكاديمي** (`account_scopes`): لأي دور غير `UNIVERSITY_ADMIN`، يُتحقق من تطابق department/year/level/cohort مع نطاق الحساب فعليًا في القاعدة — ليس افتراضًا في الكود فقط.
3. **ملكية الطالب:** إذا كان الدور `STUDENT_INTEGRATION` وتضمّن السياق `studentId`، يُرفض الطلب إن لم يطابق `principal.studentId` — هذا يمنع أي طالب من الوصول لبيانات طالب آخر حتى لو خمّن UUID صحيحًا.
4. **صلاحية مرتبطة بـ assignment فعلي:** مراجعة/تقييم الحالات السريرية (`cases:review`, `cases:grade`) لا تُمنح بمجرد الدور — بل تتطلب `supervisor_assignments` نشِطًا (`status='ACTIVE'`, ضمن `effective_from/to`) مع `supervisor_assignment_permissions.granted=true` للصلاحية المحددة، ومطابقًا لنفس department/year/level/cohort/group. هذا تصميم أدق من RBAC عادي ويمنع "صلاحية عامة" حتى للمشرفين.
5. **تنفيذ صريح على مستوى الخدمة، وليس Middleware عام فقط:** `submitDraft` (`cases/service.ts:85`) يرفض أي principal ليس `STUDENT_INTEGRATION` بحقل `studentId` مباشرة في كود الخدمة، لا فقط عبر route guard — أي أن **Authorization يتم في الـ Backend وليس الـ Frontend فقط**، وهو الشرط المطلوب صراحة في البرومبت.

**الحكم:** نموذج التفويض الحالي مصمَّم بالفعل ليمنع Student App من أي قرار حساس. لا حاجة لإعادة تصميم — فقط تفعيل نقاط النهاية الناقصة ضمن نفس النموذج (§7، `API_CONSUMER_MATRIX.md`).

---

## 7. File Lifecycle

نمط Presigned URL كامل (لا يمر الملف عبر جسم طلب API — `bodyLimit: 1MB` في `app.ts` يؤكد ذلك):

```
presign-upload (files:access) → رفع مباشر إلى MinIO → complete (تحقق sha256/type/size مطابق لما أُصدر)
  → link-attachment (STUDENT_INTEGRATION فقط، ownership check على الملف والمسودة معًا)
  → presign-read (owner المُنشئ، أو staff بصلاحية cases:review على الـ snapshot المرتبط فقط)
```

- كل خطوة محمية بـ idempotency key (`idempotency.ts`) — آمن لإعادة المحاولة من شبكة جوّال غير مستقرة، وهو سيناريو متوقع لتطبيق طالب.
- `presignRead` **لا يمنح** أي طرف آخر غير المالك أو مشرف بصلاحية review فعلية — تم التحقق مباشرة من الكود (`files/service.ts:105-119`)، وليس افتراضًا.
- فجوة معروفة وموثَّقة ذاتيًا (`known-limitations.md` البند 1-2): لا فحص مضاد للبرمجيات الخبيثة بعد، ولا مهمة تنظيف للرفعات المهجورة (presigned لكن لم تُكمَل). هذه فجوة تشغيلية وليست بنيوية — لا تغيّر ملكية الحدود.

---

## 8. Integration Strategy — الخلاصة

النظام مبني **من الأساس** على افتراض وجود عميل ثانٍ غير موثوق بالكامل (Student App) بجانب البوابة: دور مخصص محدود الصلاحيات، تحقق ملكية صريح على كل عملية كتابة طلابية، فصل صارم بين مسودة قابلة للتعديل (`student_drafts`) وسجل رسمي غير قابل للتعديل (`submission_snapshots`)، وoutbox transactional جاهز لبث أحداث لاحقًا (إشعارات) بلا إعادة تصميم مستقبلية.

**ما ينقص ليس حدودًا معمارية، بل تنفيذًا إضافيًا ضمن نفس الحدود:**
1. لا يوجد endpoint لإنشاء/تعديل/قراءة `student_drafts` (الجدول موجود، الاستهلاك منه موجود في `submitDraft`، لكن لا مسار إنشاء). هذا موثَّق ذاتيًا في `PHASE_2A_API_CONTRACT_REPORT.md` كـ "وظيفة لاحقة" صراحة — ليس اكتشافًا خفيًا لكنه **أهم فجوة تحجب تشغيل Student App اليوم**.
2. مسار تزويد الحسابات (`redeemInvitation`) لا يربط `accounts.student_id` — يمنع إصدار principal `STUDENT_INTEGRATION` صالح عمليًا.
3. `CORS_ORIGIN` أحادي القيمة يتطلب قرارًا صريحًا لمصادقة عميل بمصدر مختلف (تفصيل كامل في `STUDENT_APP_INTEGRATION_PLAN.md`).

راجع القرار النهائي الكامل والمسوَّغات في نهاية `STUDENT_APP_INTEGRATION_PLAN.md` §"القرار المعماري النهائي"، وجدول التغطية الكامل في `API_CONSUMER_MATRIX.md`.
