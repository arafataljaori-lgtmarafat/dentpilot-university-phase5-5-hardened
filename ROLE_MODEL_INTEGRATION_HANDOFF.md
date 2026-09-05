# DentPilot — Final Role Model & Integration Handoff

**الجهة:** كلية طب الأسنان · جامعة الجزيرة  
**الحالة:** المرجع التشغيلي المعتمد قبل Integration  
**نموذج المنتج:** `CONTROL` و`CLINICAL_SUPERVISOR` و`STUDENT` فقط.

> **قاعدة الحماية:** الواجهة تنظّم التجربة ولا تمنح صلاحية. القرار النهائي يأتي من Backend Authorization، وسياق النطاق الأكاديمي، وتكليف المشرف النشط، وDomain Rules.

## 1. مواءمة نموذج المنتج مع النموذج التقني الحالي

| نموذج المنتج المعتمد | المعرّف التقني الحالي | المساحة | حالة المواءمة |
|---|---|---|---|
| `CONTROL` | `UNIVERSITY_ADMIN` | Control Portal | المعرّف التشغيلي المعتمد حاليًا لإدارة الكلية/الجامعة. |
| `CLINICAL_SUPERVISOR` | `CLINICAL_SUPERVISOR` | Supervisor Workspace | معتمد دون تحويل. |
| `STUDENT` | `STUDENT_INTEGRATION` | Student Application المستقل | معتمد دون تحويل. |
| غير معتمد كمنتج | `DEPARTMENT_ADMIN` | لا توجد مساحة تشغيلية | يبقى enum وصلاحيات Backend تاريخية مؤقتًا؛ لا ينشئ Integration حسابات منه ولا يربطه بصفحات Portal. |

لا تعني بقايا `DEPARTMENT_ADMIN` في `AccountRole` أو Authorization أن الدور جزء من المنتج النهائي. إزالة enum والصلاحيات والحسابات التاريخية تحتاج **مرحلة Backend/Contracts مستقلة** مع migration واختبارات؛ وهي خارج نطاق مواءمة الواجهة والوثائق الحالية.

## 2. Role Responsibility Map

### CONTROL

`CONTROL` هو المسؤول الإداري المؤسسي، ويُنفَّذ تقنيًا الآن عبر `UNIVERSITY_ADMIN`.

| المجال | المسؤولية الحالية | ما لا يملكه أو لا يجب افتراضه |
|---|---|---|
| الأكاديمي | قراءة Dashboard، الطلاب، الملف الأكاديمي، الأقسام، المجموعات والتسجيلات ضمن ما يعيده الخادم. | لا توجد واجهات Import أو CRUD أكاديمي كامل معتمدة. |
| الإشراف | قراءة دليل المشرفين، نطاقات الإشراف، الجداول وتفاصيلها. | لا تُفترض إدارة كاملة للمشرفين أو المناوبات دون mutation contract وaudit lifecycle. |
| العمليات السريرية | مراقبة Case Registry وReview Monitoring وتفاصيل الحالة للقراءة فقط. | لا يعرض Daily Sheet أو Review Queue أو أفعال المشرف. |
| التقارير | قراءة Dashboard والتقارير المجمعة حسب العقد والنطاق. | لا يخلق مؤشرات أو بيانات غير موجودة في DTOs. |
| الصلاحيات | يعتمد على Backend Authorization. | لا يستنتج React الصلاحيات أو يبدل role من الواجهة. |

### CLINICAL_SUPERVISOR

المشرف السريري صاحب العمل اليومي المتصل بالمناوبة، وليس مديرًا أكاديميًا أو إداريًا.

| المجال | المسؤولية الحالية | حد القرار |
|---|---|---|
| اليوم والمناوبة | قراءة Home وDaily Sheet وفق duty فعّال. | لا تظهر حالة أو طالب خارج ما يعيده الخادم. |
| المراجعات | مراجعة Review Queue وCase Detail التشغيلي. | `allowedActions` وcapabilities الخادمية هي وحدها التي تحدد الإجراء المتاح. |
| الاعتماد | Start Approval وCompletion Approval عند السماح. | يتطلب assignment فعّالًا وسياقًا أكاديميًا كاملًا وانتقال Domain قانونيًا. |
| التقييم والملاحظات | Evaluation وClinical Feedback عند السماح. | لا يقرر الواجهة إمكان التقييم ولا يغير visibility خارج العقد. |
| التاريخ والتحليل | History وWork Summary للقراءة. | لا تُنشأ عدادات أو نطاقات زمنية غير موجودة في العقود. |

### STUDENT

الطالب هو مالك المسودة والتسليم الخاص به، وتُبنى تجربته التشغيلية في Student Application المستقل.

| المجال | المسؤولية الحالية | حد الملكية |
|---|---|---|
| Draft | إنشاء، قراءة، تحديث draft مملوك له باستخدام optimistic concurrency. | `principal.studentId` و`student-drafts:manage` يحددان الملكية؛ لا يختار الطالب assignment النهائي. |
| الملفات | رفع وربط مرفق بالمسودة المملوكة وفق file flow. | لا يقرأ ملفًا بلا ownership أو link مسموح. |
| Submit | إرسال draft مملوك مع idempotency key. | الخادم يتحقق من التسجيل النشط والفترة والقالب والسياسات والتكليف. |
| المتابعة | قراءة تسليماته، القرارات، feedback المرئي، والدرجة المسموح بها. | لا يرى ملاحظات داخلية أو grade مخفية، ولا يراجع أو يعتمد أو يقيّم. |

## 3. حدود التطبيقات والمسارات

| التطبيق | المسارات/السطح | حد المسؤولية |
|---|---|---|
| Control Portal | `/dashboard`, `/students`, `/departments`, `/groups`, `/control/*`, `/assignments`, `/reports` | إدارة ومتابعة مؤسسية؛ لا أفعال مشرف سريرية. |
| Supervisor Workspace | `/supervisor/*` | تنفيذ العمل السريري المسموح به من الخادم فقط. |
| Student Application | endpoints `/api/v1/student/*` | تجربة الطالب المستقلة؛ لا تُبنى داخل Control أو Supervisor Portal. |

Portal الحالي لا يعرض navigation أو routes تشغيلية لحساب `DEPARTMENT_ADMIN`. إذا وصل حساب تاريخي بهذا الدور، تظهر له حالة مواءمة صريحة بدل مساحة Control بديلة. هذا منع UI فقط، ولا يغير Authorization في الخادم.

## 4. مصادر الحقيقة أثناء Integration

| الحقيقة | المصدر |
|---|---|
| شكل البيانات والحالات | `packages/contracts/src/index.ts` |
| صلاحية الدور والنطاق | `apps/api/src/security/authorization.ts` |
| ملكية الطالب | `principal.studentId` وخدمات drafts/cases الطالبية |
| صلاحية المشرف اللحظية | Active assignment/duty وSupervisor Authorization Engine و`allowedActions` |
| الانتقالات السريرية | `packages/domain/src/index.ts` وخدمة `CasesService` |
| HTTP/CSRF/session | `apps/web/src/api/client.ts` و`apps/web/src/auth/session.tsx` |
| توزيع صفحات Portal | `apps/web/src/app/portal-app.tsx` |

## 5. ما يجب على مهندس Integration عدم تغييره

لا يعيد المهندس إظهار `DEPARTMENT_ADMIN` كدور منتج أو persona أو role picker. لا ينسخ Authorization إلى React، ولا يستنتج `allowedActions` من دور المشرف، ولا ينقل أفعال Supervisor إلى Control أو Student. كذلك لا يستعمل `payload` لاستخراج مواد أو حالات أو أسماء غير معرفة في العقود، ولا يقرأ بيانات الطالب عبر مسارات staff بدل student-owned endpoints.

لا يعتبر وجود جدول أو endpoint أو enum تاريخي دليلًا على Feature جاهزة. أي إزالة نهائية لـ`DEPARTMENT_ADMIN` من Backend أو Contracts أو قاعدة البيانات يجب أن تتم في change مستقلة تشمل migration، وseed، واختبارات Authorization وintegration.

## 6. الفجوات المتبقية قبل الربط

| المجال | الفجوة | جهة العمل التالية |
|---|---|---|
| إلغاء الدور التاريخي | `DEPARTMENT_ADMIN` ما زال موجودًا في `AccountRole` وAuthorization والـseed. | Backend/Contracts maintenance مستقلة بعد قرار migration. |
| Control Clinical Operations | read model الحالي عام ومحدود؛ لا يعيد كل السياق الإداري المطلوب مستقبلًا. | Product + Backend contract، إذا احتاج Control مراقبة أوسع. |
| تجربة الطالب الكاملة | لا توجد Student Self Profile أو Published Templates أو Requirements أو Resubmission read models كاملة. | فريق Student Integration + Backend contracts. |
| Deployment | Secrets وTLS وCORS/cookie topology وPostgreSQL/MinIO والنسخ الاحتياطي والمراقبة. | مهندس Deployment/Integration. |

## 7. ترتيب البدء المقترح

1. يعامل مهندس Integration `CONTROL = UNIVERSITY_ADMIN` في هذه النسخة فقط، ولا ينشئ أو يربط `DEPARTMENT_ADMIN`.
2. يثبت session وCSRF وCORS/cookie topology، ثم يختبر Control وSupervisor وStudent end-to-end.
3. يبني Student Application من student-owned contracts الحالية، ويطلب العقود الناقصة كطلبات مستقلة.
4. يخطط لإزالة `DEPARTMENT_ADMIN` تقنيًا لاحقًا، بعد اختبار migration وعدم وجود حسابات أو integrations تعتمد عليه.

**هذه الوثيقة تحل محل أي Handoff تشغيلي سابق يقدّم Department Admin كدور منتج حالي. التقارير المرحلية التاريخية تبقى أدلة زمنية ولا تمثل نموذج المنتج النهائي.**
