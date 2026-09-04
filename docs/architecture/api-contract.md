# API Contract — Phase 1 Core + Phase 2A Read Contracts

## قواعد عامة

تستخدم API السابقة `/api/v1`. تستخدم كل استجابة خطأ المغلف `{ error: { code, message, requestId, details? } }`. لا يقبل أي endpoint حساس role أو permission أو tenantId من العميل لتحديد الوصول. تحمي mutation endpoints عبر session cookie و`x-csrf-token` المطابق.

| Endpoint | الاستخدام | التفويض والحماية |
| --- | --- | --- |
| `GET /health/live` | تحقق عملية الخدمة. | عام؛ لا يكشف تبعيات. |
| `GET /health/ready` | تحقق PostgreSQL وobject storage. | عام؛ لا يكشف أسرارًا. |
| `POST /api/v1/auth/login` | جلسة مؤسسة. | organizationId + email/password، rate-limited؛ cookie آمنة. |
| `POST /api/v1/auth/logout` | إلغاء الجلسة. | session + CSRF. |
| `GET /api/v1/session` | `SessionActorDto`: account/organization/college/role/department scopes. | session فقط؛ لا يقبل role أو scope من العميل. |
| `POST /api/v1/invitations` | إنشاء دعوة. | University Admin فقط + CSRF؛ token لا يعود في الإنتاج. |
| `POST /api/v1/invitations/redeem` | redeem أحادي الاستعمال. | token hash/expiry/revocation. |
| `GET /api/v1/catalog/departments` | قائمة الأقسام المخولة. | `catalogs:read` + account scopes. |
| `GET /api/v1/catalog/academic-years` | قائمة الأعوام الأكاديمية. | `catalogs:read` + RLS. |
| `GET /api/v1/catalog/academic-levels` | قائمة المستويات الأكاديمية. | `catalogs:read` + RLS. |
| `GET /api/v1/catalog/cohorts` | قائمة الدفعات الأكاديمية. | `catalogs:read` + RLS. |
| `GET /api/v1/groups` | قائمة المجموعات مع مرشحات السياق. | `groups:read` + department/year/level scopes. |
| `GET /api/v1/students` | قائمة طلاب paginated في scope. | `students:read` مع department/year/level/cohort scopes وserver-side search. |
| `GET /api/v1/students/:id` | هوية الطالب وتاريخ التسجيل وعضويات roster/group المخولة. | `students:read`؛ scope مشتق من السجلات الفعلية. |
| `GET /api/v1/supervisor-assignments` | قائمة التكليفات والصلاحيات الفعالة/التاريخية في النطاق. | University أو Department scope أو تكليفات المشرف نفسه. |
| `POST /api/v1/enrollments/:id/close` | إغلاق التسجيل والعضويات في transaction. | `rosters:manage` على كل roster department مع year/level/cohort scope + CSRF + revision/reason/idempotency. |
| `POST /api/v1/groups/memberships` | نقل/إسناد group. | `groups:manage` على السياق المستخرج خادميًا من enrollment/group + policy guards + CSRF. |
| `POST /api/v1/student/submissions` | submit draft خاص للطالب. | student owner + CSRF + idempotency؛ snapshot immutable. |
| `GET /api/v1/staff/submissions` | قائمة submitted snapshots الحالية فقط مع pagination/filtering. | University أو active supervisor assignment مع `reviewCases`؛ لا draft rows. |
| `GET /api/v1/staff/submissions/:id` | detail typed للـsnapshot والسياسات والتاريخ والمرفقات. | `cases:review` + scope؛ لا draft endpoint هنا. |
| `POST /api/v1/staff/submissions/:id/revision-requests` | طلب revision. | active assignment + `reviewCases` + CSRF. |
| `POST /api/v1/staff/submissions/:id/approve-start` | اعتماد بدء الحالة. | active effective assignment + `reviewCases` + full academic scope + CSRF. |
| `POST /api/v1/staff/submissions/:id/approve-final` | الاعتماد النهائي للحالة. | active effective assignment + `reviewCases` + full academic scope + CSRF. |
| `POST /api/v1/staff/submissions/:id/grades` | grade/amend grade. | active assignment + `grade` + CSRF؛ reason للتعديل. |
| `POST /api/v1/term-results/:id/{reviewed,approved,locked,reopened}` | state commands للنتائج. | University Admin + CSRF + expectedRevision + idempotency؛ reopen reason. |
| `GET /api/v1/reports/aggregate` | مقاييس aggregate-only. | `reports:aggregate`؛ DTO لا يحمل student name/id. |
| `GET /api/v1/reports/dashboard` | KPIs للجامعة أو القسم. | `reports:aggregate` + year/department scope؛ بلا student identity. |
| `GET /api/v1/reports/scoped` | صفوف أداء الأقسام المخولة. | `reports:aggregate` + year/department scope؛ بلا student identity. |
| `POST /api/v1/files/presign-upload` | fileId وURL رفع خاص قصير بلا object key خام. | principal + CSRF + idempotency؛ allowed type/size/checksum/content-length. |
| `POST /api/v1/files/:id/complete` | تحقق الخادم من type/size/SHA-256 ثم انتقال إلى `UPLOADED`. | account owner + CSRF + idempotency. |
| `POST /api/v1/files/:id/attachments` | ربط ملف مكتمل بمسودة الطالب المالك. | Student Integration owner فقط + CSRF + idempotency. |
| `GET /api/v1/files/:id/presign-read` | URL قراءة خاص قصير. | owner أو University Admin أو active assigned reviewer؛ 5 دقائق. |

يمكن استكشاف OpenAPI الفعلي عبر `GET /openapi.json` أو واجهة `/docs`. عقود الطالب لا تعرض ملاحظات المشرف أو audit internals أو requirement drafts أو بيانات التحكم المؤسسية.

هذه هي قائمة Features الخادمية المعلنة في Phase 1 وقراءات Phase 2A المنفذة. الجداول أو الوظائف التي لا يقابلها endpoint هنا هي foundations وليست API مكتملة.
