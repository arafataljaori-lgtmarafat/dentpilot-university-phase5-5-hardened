# API_CONSUMER_MATRIX

مصدر كل صف: `apps/api/src/app.ts` (تعريف المسار) + `apps/api/src/security/authorization.ts` (`rolePermissions`) + كود الخدمة المعنية. **Consumer** يعني من يُسمح له فعليًا اليوم بحكم الدور، لا من "يُفترض" أنه يستخدمه.

الأدوار: `UA`=UNIVERSITY_ADMIN، `DA`=DEPARTMENT_ADMIN، `CS`=CLINICAL_SUPERVISOR، `SI`=STUDENT_INTEGRATION (Student App مستقبلًا).

## نقاط النهاية العامة / التأسيسية

| API | Consumer | الغرض | الصلاحية المطلوبة | نطاق البيانات | اعتبارات أمنية |
|---|---|---|---|---|---|
| `GET /health/live` | Infra/LB | فحص حياة العملية | بلا مصادقة | لا شيء | يجب ألا يكشف أي تفاصيل داخلية — لا يفعل |
| `GET /health/ready` | Infra/LB | فحص جاهزية DB+Storage | بلا مصادقة | لا شيء | نفس الملاحظة |
| `GET /openapi.json` | أي عميل (توثيق) | مخطط OpenAPI | بلا مصادقة | مخطط فقط، لا بيانات | مقبول لأنه توثيق عقد لا بيانات |
| `POST /api/v1/auth/login` | Portal + مستقبلًا Student App | تسجيل دخول | بلا مصادقة مسبقة، rate-limit 5/دقيقة | لا شيء يُعاد سوى cookies | `dummyPasswordHash` يمنع user enumeration عبر توقيت الاستجابة |
| `POST /api/v1/auth/logout` | Portal + Student App | إبطال الجلسة الحالية | principal + CSRF | جلسة الحساب نفسه فقط | — |
| `GET /api/v1/session` | Portal + Student App | معرفة principal الحالي (دور/نطاق) | principal فقط | بيانات الحساب المتصل نفسه | لا يكشف بيانات حساب آخر |
| `POST /api/v1/invitations` | **Portal فقط (Staff)** | إصدار دعوة حساب جديد | `invitations:issue` (UA فقط ضمن `rolePermissions`) | — | التوكن يُعاد في الاستجابة **فقط** في `NODE_ENV==='development'` — صحيح للإنتاج |
| `POST /api/v1/invitations/redeem` | أي حامل توكن دعوة صالح | تفعيل حساب جديد بكلمة مرور | توكن دعوة صالح غير منتهٍ | — | **راجع الفجوة:** لا يُمرَّر/يُحفَظ `student_id` هنا حتى لو كان الدور `STUDENT_INTEGRATION` (`STUDENT_APP_INTEGRATION_PLAN.md §4`) |

## Catalogs — مشتركة بين Portal وStudent App

| API | Consumer | الغرض | الصلاحية | نطاق البيانات | ملاحظات |
|---|---|---|---|---|---|
| `GET /api/v1/catalog/departments` | Portal + **SI** | قائمة الأقسام | `catalogs:read` (كل الأدوار بما فيها SI) | مقيَّدة بـ `account_scopes` لغير UA | آمن للطالب — لا بيانات حساسة |
| `GET /api/v1/catalog/academic-years` | Portal + **SI** | قائمة السنوات الأكاديمية | `catalogs:read` | عامة داخل المؤسسة | — |
| `GET /api/v1/catalog/academic-levels` | Portal + **SI** | قائمة المستويات | `catalogs:read` | عامة داخل المؤسسة | — |
| `GET /api/v1/catalog/cohorts` | Portal + **SI** | قائمة الأفواج | `catalogs:read` | عامة داخل المؤسسة | — |

هذه هي مجموعة الـ APIs **المشتركة الوحيدة اليوم** بين Portal وStudent App بحكم `rolePermissions`.

## إدارة الطلاب والتوزيع — Portal فقط (يجب ألا تُكشف لـ Student App)

| API | Consumer | الغرض | الصلاحية | نطاق البيانات | لماذا محظور على SI |
|---|---|---|---|---|---|
| `GET /api/v1/groups` | Portal (Staff) | قائمة المجموعات | `groups:read` | نطاق الحساب | `groups:read` غير موجود في صلاحيات SI |
| `GET /api/v1/students` | Portal (Staff) | قائمة الطلاب (كل طلاب النطاق) | `students:read` | نطاق department/year/level/cohort | يكشف بيانات طلاب آخرين — يجب ألا يصل إليه SI مطلقًا |
| `GET /api/v1/students/:id` | Portal (Staff) | تفاصيل طالب واحد كاملة | `students:read` | — | نفس السبب |
| `GET /api/v1/supervisor-assignments` | Portal (Staff) | قائمة تكليفات المشرفين | `assignments:read` | نطاق الحساب | بيانات تشغيلية إدارية |
| `POST /api/v1/enrollments/:id/close` | Portal (UA/DA) | إغلاق قيد أكاديمي | `rosters:manage` + نطاق | — | قرار إداري، ليس للطالب |
| `POST /api/v1/groups/memberships` | Portal (UA/DA) | تعيين طالب لمجموعة | `groups:manage` + نطاق | — | قرار إداري |

## دورة التقديم السريري (Case Submission)

| API | Consumer | الغرض | الصلاحية | نطاق البيانات | ملاحظات |
|---|---|---|---|---|---|
| `POST /api/v1/student/submissions` | **SI فقط** (مفروض في كود الخدمة، ليس فقط route) | تحويل مسودة إلى snapshot نهائي غير قابل للتعديل | يتطلب `principal.role==='STUDENT_INTEGRATION'` و`studentId` مطابق لمالك المسودة | مسودة الطالب المالك فقط | **Consumer الوحيد المصمَّم له Student App صراحة** — نقطة التكامل الجوهرية |
| `GET /api/v1/staff/submissions` | Portal (Staff) | قائمة التقديمات المُرسلة | `submissions:read` + نطاق | لا يشمل drafts | **يجب ألا يُكشف لـ SI** — يعرض تقديمات كل الطلاب في النطاق |
| `GET /api/v1/staff/submissions/:id` | Portal (CS بصلاحية review نشِطة) | تفاصيل تقديم كامل (ملاحظات، قرارات، درجات) | `cases:review` + assignment نشِط مطابق | — | يكشف `supervisorNotes` الداخلية — **لا يصلح كما هو لعرضه على الطالب حتى لو أُتيح مستقبلًا؛ يلزم مسار مختلف يُصفّي الحقول الداخلية** |
| `POST /api/v1/staff/submissions/:id/revision-requests` | Portal (CS) | طلب تعديل | `cases:review` + assignment `reviewCases` نشِط | — | Staff فقط |
| `POST /api/v1/staff/submissions/:id/approve-start` | Portal (CS) | اعتماد بدء الحالة | `cases:review` + assignment `reviewCases` | — | Staff فقط |
| `POST /api/v1/staff/submissions/:id/approve-final` | Portal (CS) | اعتماد نهائي | `cases:review` + assignment `reviewCases` | — | Staff فقط |
| `POST /api/v1/staff/submissions/:id/grades` | Portal (CS) | تسجيل/تعديل درجة | `cases:grade` + assignment `grade` نشِط | — | تعديل درجة يفرض `reason` إجباري |

## نتائج الفصل الدراسي — Portal/UA حصريًا

| API | Consumer | الغرض | الصلاحية | ملاحظات |
|---|---|---|---|---|
| `POST /api/v1/term-results/:id/reviewed` | Portal (UA/DA) | انتقال حالة | `term-results:approve` | state machine صارمة |
| `POST /api/v1/term-results/:id/approved` | Portal (UA/DA) | انتقال حالة | `term-results:approve` | — |
| `POST /api/v1/term-results/:id/locked` | Portal (UA فقط فعليًا حسب rolePermissions) | قفل النتائج | `term-results:lock` | يمنع أي approve/grade لاحق على الحالات المرتبطة (`assertTermUnlocked`) |
| `POST /api/v1/term-results/:id/reopened` | Portal (UA) | إعادة فتح | `term-results:lock` | يفرض `reason` |

## التقارير — Portal/إداري حصريًا

| API | Consumer | الغرض | الصلاحية | ملاحظات |
|---|---|---|---|---|
| `GET /api/v1/reports/aggregate` | Portal (UA/DA) | تجميع إحصائي | `reports:aggregate` | لا صلاحية لـ CS ولا SI |
| `GET /api/v1/reports/dashboard` | Portal (UA/DA) | لوحة معلومات | `reports:aggregate` | — |
| `GET /api/v1/reports/scoped` | Portal (UA/DA) | تقرير بنطاق قسم | `reports:aggregate` | — |

## الملفات — مشتركة مع تحقق ملكية صارم

| API | Consumer | الغرض | الصلاحية | نطاق البيانات | ملاحظات |
|---|---|---|---|---|---|
| `POST /api/v1/files/presign-upload` | Portal + **SI** | إصدار رابط رفع موقَّع | `files:access` (موجودة لكلا الفئتين) | ملف يُنشأ باسم `principal.accountId` | حد 25MB، أنواع محددة فقط (pdf/jpeg/png/webp) |
| `POST /api/v1/files/:id/complete` | Portal + **SI** | تأكيد اكتمال الرفع | `files:access` + ملكية الملف | — | يتحقق من تطابق sha256/type/size فعليًا في MinIO، لا يثق بالعميل |
| `POST /api/v1/files/:id/attachments` | **SI فقط** (مفروض صراحة في كود الخدمة) | ربط ملف مكتمل بمسودة | `files:access` + `principal.role==='STUDENT_INTEGRATION'` + ملكية الملف والمسودة معًا | مسودة الطالب المالك فقط | Staff لا يستخدم هذا المسار إطلاقًا |
| `GET /api/v1/files/:id/presign-read` | Portal (مراجع) + **SI** (مالك) | رابط قراءة موقَّت | مالك الملف، أو `cases:review` على الـ snapshot المرتبط | — | لا طرف ثالث يمكنه القراءة |

---

## APIs مطلوبة لـ Student App وغير موجودة بعد

| API مقترح | الغرض | لماذا لازم |
|---|---|---|
| `POST /api/v1/student/drafts` | إنشاء مسودة جديدة | لا مسار حاليًا لإنشاء `student_drafts` — **أولوية أولى مطلقة** |
| `GET /api/v1/student/drafts/:id` أو `GET /api/v1/student/drafts` | قراءة مسودة/مسودات الطالب | لازم لعرض حالة العمل الجاري |
| `PUT /api/v1/student/drafts/:id` | تحديث محتوى مسودة (مع `expectedRevision` بنفس نمط optimistic lock الموجود) | لازم للتحرير التدريجي قبل الإرسال |
| `GET /api/v1/student/submissions/:id` أو `GET /api/v1/student/submissions` | قراءة حالة/نتيجة تقديم الطالب نفسه (مُصفَّاة من الحقول الداخلية) | لا يصح استخدام `GET /api/v1/staff/submissions/:id` لأنه يكشف `supervisorNotes` وتفاصيل داخلية غير مخصصة للطالب |

## APIs يجب ألا تُكشف لـ Student App تحت أي ظرف (بحكم التصميم الحالي، ويجب أن يبقى كذلك)

`invitations`, `groups` (قائمة عامة), `students` (قائمة/تفاصيل أي طالب), `supervisor-assignments`, `enrollments/:id/close`, `groups/memberships`, `staff/submissions*` (كل المسار الإداري), `term-results*`, `reports/*`. كل هذه محظورة اليوم فعليًا عبر `rolePermissions.STUDENT_INTEGRATION` المحدودة إلى `catalogs:read` و`files:access` فقط — أي توسيع لصلاحيات SI مستقبلًا يجب أن يمر عبر مراجعة معمارية صريحة، لا إضافة صامتة.

## أي نقص معماري محتمل آخر (بخلاف ما ورد في STUDENT_APP_INTEGRATION_PLAN)

لا يوجد نقص في **تصنيف** الـ APIs (كل مسار مصنَّف بوضوح staff-only أو shared) — النقص الوحيد هو في **عدد** المسارات المتاحة لـ SI (drafts CRUD وقراءة تقديم الطالب)، وهو نقص تنفيذي كما هو موثَّق في `STUDENT_APP_INTEGRATION_PLAN.md`، وليس نقصًا في نموذج التصنيف أو الحدود نفسها.
