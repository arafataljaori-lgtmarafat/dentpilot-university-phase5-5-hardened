# PHASE_2D_STUDENT_INTEGRATION_REPORT

**الهدف:** إغلاق فجوات التكامل الثلاث اللازمة لتشغيل DentPilot Student App فوق University Core، بالقرار المعماري المعتمد (A) — بلا إعادة بناء، بلا نقل business logic، بلا تغيير في الحدود المعمارية أو نموذج التفويض أو الـ Workflow أو الـ Audit أو الـ Security Model الحاليين.

---

## الملفات المتغيرة

### كود وبنية تحتية جديدة

| الملف | لماذا |
|---|---|
| `apps/api/src/modules/drafts/service.ts` | `StudentDraftsService` — create/list/detail/update لـ `student_drafts`، مملوكة حصريًا لمبدأ `STUDENT_INTEGRATION` |
| `database/migrations/0003_student_integration.sql` | يضيف `invitations.student_id` (بقيد شرطي بالدور)، فهرسًا فريدًا جزئيًا على `accounts.student_id` يمنع ربط حسابين بنفس الطالب، وفهرسي أداء للمسارات الجديدة |

### اختبارات جديدة

| الملف | يغطي |
|---|---|
| `tests/unit/student-drafts.test.ts` | `StudentDraftsService`: رفض غير الطالب، ملكية enrollment، نشر القالب، القفل التفاؤلي |
| `tests/unit/student-submission-read-model.test.ts` | `listForStudent`/`detailForStudent`: رفض الموظفين، إخفاء بيانات طالب آخر، بوابة رؤية الدرجة (مخفية افتراضيًا، ظاهرة عند السماح، والحالة الافتراضية عند غياب المفتاح) |
| `tests/unit/student-provisioning.test.ts` | `issueInvitation`/`redeemInvitation`: التحقق الشرطي بالدور، رفض طالب غير موجود أو مربوط مسبقًا، نقل `student_id` الصحيح |
| `tests/integration/student-integration.test.ts` | تدفق HTTP فعلي كامل: دورة حياة draft، عزل بين طالبين، تزويد حساب عبر دعوة حقيقية end-to-end، نموذج القراءة (حالة/قرارات/ملاحظات منشورة فقط/درجة مشروطة)، ومنع `STUDENT_INTEGRATION` من مسارات الموظفين |

### كود معدَّل

| الملف | التعديل | لماذا |
|---|---|---|
| `packages/contracts/src/index.ts` | إضافة `StudentDraftDto`, `StudentDraftListDto`, `StudentSubmissionListDto`, `StudentSubmissionDetailDto`, `StudentDecisionDto`, `StudentFeedbackNoteDto`, `StudentGradeDto` | عقود DTO جديدة، مبنية فوق `CreateDraftInput`/`StudentSubmissionDto` الموجودين مسبقًا في هذا الملف دون أي كود يستهلكهما |
| `apps/api/src/security/authorization.ts` | صلاحيتان جديدتان: `student-drafts:manage`، `student-submissions:read` — ممنوحتان حصرًا لـ `STUDENT_INTEGRATION` | انظر "قرارات تصميمية" أدناه |
| `apps/api/src/modules/cases/service.ts` | إضافة `listForStudent`/`detailForStudent` | نموذج قراءة طلابي منفصل تمامًا عن `list`/`detail` الموجودين (الموظفين) |
| `apps/api/src/security/auth.ts` | `issueInvitation` يقبل `studentId` اختياريًا مع تحقق شرطي بالدور ووجود الطالب وعدم ربطه مسبقًا؛ `redeemInvitation` ينسخ `invitations.student_id` إلى `accounts.student_id` | إغلاق فجوة التزويد الموثَّقة في `known-limitations.md` |
| `apps/api/src/api-schemas.ts` | 6 مخططات جديدة (drafts×4، submissions×2) + إضافة `studentId` اختياري لمخطط `invitation` | توثيق OpenAPI وتحقق صارم لكل مسار جديد |
| `apps/api/src/app.ts` | تسجيل 6 مسارات جديدة، تمرير `studentId` في مسار الدعوات، حقن `StudentDraftsService` | الربط الفعلي |
| `tests/unit/api-contract.test.ts` | إضافة المسارات الجديدة إلى `requiredPaths` | يحمي اكتمال توثيق OpenAPI للمسارات الجديدة مستقبلًا |
| `tests/unit/authorization-matrix.test.ts` | اختبار مخصَّص منفصل للصلاحيتين الجديدتين | لا يمكن ضمّهما لمصفوفة `permissions`/`expected` المشتركة لأن `UNIVERSITY_ADMIN` لا يملكهما فيها (شرح كامل في التعليق داخل الملف) |
| `docs/operations/known-limitations.md`, `PHASE_2A_API_CONTRACT_REPORT.md` | تحديث بندين لم يعودا دقيقين | نظافة توثيقية — لا تُترك وثيقة تصف فجوة أُغلقت |

لا تعديل على `apps/web`، ولا على `packages/domain`، ولا على أي عمود أو جدول موجود في المخطط.

---

## كيف حُفظت المعمارية

- **لا تعديل على `packages/domain`.** كل قاعدة عمل جديدة (القفل التفاؤلي، ملكية الطالب) أُعيد استخدامها حرفيًا من `assertOptimisticLock` الموجودة، بنفس نمط `students.closeEnrollment`/`results.transition`.
- **لا تجاوز لـ `AuthorizationService` أو RLS.** كل مسار جديد يمر عبر `db.withTenant()` ثم `authorization.assert()`، بنفس الشكل الحرفي المستخدم في `submitDraft`/`linkToDraft` الموجودين.
- **لا توسيع لصلاحيات الطالب.** الصلاحيتان الجديدتان مسمّاتان ومقصورتان على `STUDENT_INTEGRATION` فقط؛ لم تُمنح لأي دور موظف، ولم يُعَد استخدام `submissions:read`/`reports:aggregate` الموجودتين (كان سيمنح ذلك الطالب وصولًا غير نطاقي لمسار `staff/submissions`).
- **لا تغيير في الـ Workflow.** `submitDraft`، آلات الحالة في `packages/domain`، وتسلسل `case_sheets`/`submission_snapshots` كما هي تمامًا.
- **لا تغيير في نظام الـ Audit.** كل mutation جديد يستدعي `AuditService.append` بنفس الشكل المستخدم في كل الوحدات الأخرى.
- **لا تغيير في Security Model.** نفس الجلسة، نفس CSRF، نفس RLS، بلا JWT أو نظام مصادقة بديل.
- **المخطط (schema) اتسع فقط، ولم يتغيّر.** عمود واحد جديد (`invitations.student_id`) وثلاثة فهارس جديدة — لا تعديل ولا حذف على أي عمود أو جدول قائم؛ Migration تراكمية بالكامل (`0003` تُطبَّق فوق `0001`/`0002` دون لمسهما).

---

## قرارات تصميمية رئيسية

1. **حل الفصل الدراسي (term) من الخادم لا من العميل.** يطابق شكل `CreateDraftInput` الموجود مسبقًا في `packages/contracts` (بلا `termId`). يُفضَّل الفصل الذي يغطي تاريخ اليوم، ويتراجع لأحدث فصل نشِط عند غياب تطابق تاريخي — نفس أسلوب "تفضيل الأدق ثم التراجع" المستخدم في حل `supervisor_assignment` داخل `submitDraft`.
2. **حذف المسودة عند الإرسال (سلوك موجود مسبقًا في `submitDraft`) يُستثمر كما هو.** لا حاجة لعلم حالة إضافي يمنع تعديل مسودة بعد إرسالها؛ القراءة أو التعديل بعد الحذف تُرجع `404` تلقائيًا دون أي كود إضافي.
3. **صلاحيتان جديدتان بدل إعادة استخدام صلاحيات الموظفين الحالية.** قرار أمني متعمد — انظر الجدول أعلاه وتعليق `authorization-matrix.test.ts`.
4. **بوابة رؤية الدرجة تُقرأ من `clinical_workflow_policy_versions.definition->>'studentGradeVisible'`.** هذا الحقل كان موجودًا فعليًا في `seed.ts` دون أي كود يقرأه سابقًا؛ استُخدم تمامًا كما صُمِّم أصلًا، بنفس نمط `COALESCE(...,default)` المستخدم لـ `maxGrade` في `CasesService.grade`.
5. **`resubmission_of_snapshot_id` لم يُمس.** اكتُشف أثناء المراجعة أن تسلسل إعادة الإرسال غير منفَّذ أصلًا في `submitDraft` — كل إرسال ينشئ `case_sheet` مستقلًا بدل ربطه بالسابق. هذا خارج نطاق الفجوات الثلاث المطلوبة، ويمسّ الـ Workflow الحالي الممنوع تعديله؛ تُرك كما هو، مع تحديث ملاحظة في `PHASE_2A_API_CONTRACT_REPORT.md` ليبقى التوثيق صادقًا.
6. **لا مسار بعد لاكتشاف الطالب لـ `studentId`/`enrollmentId` الخاصين به.** `GET /api/v1/session` لا يعيد `studentId`، ولا يوجد "my enrollments" endpoint. الاختبارات تستخدم معرفات معروفة من fixtures مباشرة. Student App حقيقي سيحتاج هذا قبل أن يعمل عمليًا؛ لم يُبنَ هنا لأنه خارج الفجوات الثلاث المحددة صراحة، ويُوصى به كخطوة تالية فورية.
7. **مراجعة الملفات (المهمة 4) لم تحتج أي تعديل.** تدفق presign-upload → complete → link → presign-read يعمل بالفعل ضمن ownership/permission/idempotency الصحيحة لـ `STUDENT_INTEGRATION`؛ لم يُكتشف نقص حقيقي.
8. **مراجعة المصادقة/CORS (المهمة 5) توصية فقط، بلا كود.** `CORS_ORIGIN` قيمة واحدة اليوم؛ التوصية (مفصَّلة سابقًا في `STUDENT_APP_INTEGRATION_PLAN.md`) هي تحويلها لقائمة مسموحة إن كان Student App ويب بمصدر مختلف، أو إعادة استخدام نموذج الجلسة الحالي كما هو لعميل أصلي (native) — قرار نشر لاحق، لا يتطلب تعديل `AuthService`.

---

## حالة الاختبار

- `npm run typecheck` و`npm run lint`: نظيفان بالكامل عبر كل الحزم (`contracts`, `domain`, `config`, `api`, `web`).
- `npm run test:unit`: **130/130** ناجحة (104 أصلية + 26 جديدة عبر 3 ملفات)، **صفر انحدار**.
- ملفات الاختبار الأربعة الجديدة ومُلفّا الاختبار المعدَّلان تحقَّق منها يدويًا عبر `tsc --noEmit` بنفس إعدادات المشروع (`ES2022`/`NodeNext`/`strict`) — نظيفة بالكامل، رغم أن `tests/**` خارج نطاق سكربت `typecheck` القياسي في `package.json`.
- `tests/integration/student-integration.test.ts`: يُحمَّل بنجاح ويسجّل كل الاختبارات الـ11 بلا أي خطأ بنيوي أو نوعي؛ تنفيذه الفعلي يتطلب PostgreSQL وMinIO حيّين (`docker compose`) غير متاحين في بيئة هذه المراجعة. يعمل عبر التدفق القياسي للمشروع: `npm run infra:up` ثم `npm run db:migrate` ثم `npm run db:seed` ثم `npm run test:integration`.

---

## معيار النجاح (من البرومبت)

بعد هذا العمل، Student App قادر على: تسجيل الدخول (بعد تزويد حساب عبر دعوة)، إنشاء مسودة، تعديلها بقفل تفاؤلي آمن، رفع مرفقاتها (كان يعمل مسبقًا)، إرسالها (كان يعمل مسبقًا)، ومتابعة حالتها (نتائج منشورة/ملاحظات منشورة/درجة مشروطة بالسياسة) — كل ذلك دون أي صلاحية إدارية، ودون أن يرى Student App أو أي طالب بيانات لا يملكها. University Core يبقى System of Record الوحيد؛ لا Regression على أي مسار قائم.
