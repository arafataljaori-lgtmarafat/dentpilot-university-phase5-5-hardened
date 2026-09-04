# DentPilot University — Portal Migration Map

## حالة الوثيقة

- النطاق: تحليل Phase 2 وسجل الربط المرجعي لتنفيذ Phase 2B.
- حالة Phase 1: مغلقة ومعتمدة؛ لا تقترح هذه الوثيقة تغيير معمارية الـCore أو تخفيف أي ضابط أمني.
- حالة Phase 2A: **API READY** وفق بوابة Phase 2A المعتمدة.
- حالة نقل الواجهة: **IMPLEMENTED / ACCEPTANCE PENDING** للشاشات التي تدعمها عقود Phase 2A.
- بوابة التنفيذ: **OPEN**؛ تبقى بوابة End-to-End معلقة إلى تشغيل الواجهة والـAPI وPostgreSQL وMinIO معًا في بيئة القبول.
- جدول الفجوات أدناه محفوظ كسجل تحليل ما قبل Phase 2A؛ حالة التنفيذ الفعلية موثقة في `PHASE_2B_MIGRATION_REPORT.md`.

## المرجع الذي تمت مراجعته

| المرجع | النسخة/البصمة | الاستخدام |
| --- | --- | --- |
| Production Core المحلي | Phase 1 Closure baseline | السلطة المعمارية والأمنية وعقود API الفعلية |
| `DentPilot-University-Portal-Sanaa-Premium-Institutional-Corrected.zip` | Portal `0.6.7`، SHA-256: `c0dde6c755eb8b0ea663bc9a7af0a8ccc480ab1c7d12bdb0aa4d20f578c92f58` | مرجع v7 البصري والسلوكي |
| `reference/prototype-v7/` داخل Phase 1 | وحدتان فقط: `portal-groups.js` و`portal-permissions.js` | مرجع جزئي، وليس المصدر الكامل للواجهة |
| `apps/web` | React 19 + TypeScript + Vite، Diagnostic Shell فقط | نقطة انطلاق Frontend الإنتاجي |
| `apps/api/src/app.ts` و`docs/architecture/api-contract.md` | `/api/v1` | المصدر الفعلي للـendpoints المتاحة |

تم تشغيل فحص JavaScript واختبار المرجع `v067-flexible-clinical-workflow.test.cjs` مباشرة، وكانت النتيجة:

```text
PASS v0.6.7: Flexible Clinical Workflow policies, snapshots, supervision, approvals, grading and privacy.
```

هذا النجاح يثبت اتساق النموذج المحلي فقط، ولا يثبت اتصال أي شاشة بالـBackend أو PostgreSQL.

## معاني حالات النقل

| الحالة | المعنى |
| --- | --- |
| `NOT STARTED` | لم تُنقل الشاشة إلى Frontend الإنتاجي. |
| `API READY` | القراءة والكتابة اللازمة للشاشة متاحة بعقود دقيقة وقابلة للاختبار. |
| `PARTIAL API` | توجد أوامر أو قراءة جزئية، لكنها لا تكفي لإكمال الشاشة من الواجهة إلى قاعدة البيانات. |
| `API GAP` | لا يوجد endpoint إنتاجي يدعم الوظيفة. |
| `CONTRACT BLOCKER` | التنفيذ موجود جزئيًا، لكن عقد TypeScript/OpenAPI لا يطابق الاستجابة أو ليس محددًا بما يكفي لتوليد Client آمن. |
| `REFERENCE GAP` | الوظيفة مطلوبة للقبول، لكنها غير موجودة كشاشة في v7 وتحتاج مواصفة واجهة منفصلة. |

## الجرد الفعلي لشاشات v7

### App Shell والمصادقة

- شاشة دخول مؤسسي تجريبية.
- Sidebar مجمّعة حسب الدور.
- Top Bar، breadcrumbs، سياق الجامعة/القسم/التكليف، إشعارات، dialogs وtoast.
- Account/role switcher تجريبي يغير الصلاحيات محليًا.
- حالات Desktop وSupervisor Mobile.

### University Admin وDepartment Admin

- University Dashboard وDepartment Dashboard.
- Departments Directory.
- Department Workspace بالتبويبات: Overview، Levels & Groups، Rosters، Assignments، Cases، Requirements، Reports.
- Students Directory وStudent Academic Profile.
- Rosters Directory وRoster Spreadsheet/Detail.
- Academic Groups Directory وGroup Detail.
- Faculty Directory وFaculty Profile.
- Supervisor Assignments Administration.
- Requirement Sets Directory وRequirement Set Detail.
- Case Sheets Directory وCase Detail.
- Approvals Queue.
- Reports بتبويبات Student Progress، Department Performance، Clinical Operations، Requirements، Grading، Supervisor Workload.
- Settings: University Profile، Academic Structure، Departments، Roles & Permissions، Clinical Workflow، Branding، System/Demo.

### Clinical Supervisor

- My Assignments.
- Assignment Workspace.
- Assigned Case Sheets.
- Assigned Student Roster.
- Tasks & Notifications.
- Supervisor Student View.
- Case review، clinical decisions، grade، grade amendment، note.

### شاشة غير موجودة في v7

- لا توجد شاشة Term Results/Final Results state machine في مصدر v0.6.7، رغم وجود أوامر انتقال Phase 1 في الـBackend واشتراط `Term lock` ضمن قبول Phase 2.

## جرد المكونات القابلة لإعادة البناء

لا تُنقل هذه المكونات كـHTML strings أو global functions؛ يعاد بناؤها كمكونات React typed.

| المجموعة | مكونات v7 المرئية | الهدف الإنتاجي |
| --- | --- | --- |
| Shell | Sidebar، Top Bar، breadcrumbs، role/context badges، mobile scrim | `AppShell` وRoute Layouts تعتمد على Session server principal |
| Feedback | Modal، toast، empty state، loading placeholder غير مكتمل | Dialog accessible، Toast، ErrorState، LoadingState، EmptyState |
| Navigation | Role-based nav، back stack محلي | Router حقيقي ومسارات ثابتة؛ الإخفاء Presentation فقط |
| Metrics | metric cards، attention panel، progress bars | Server-derived aggregate DTOs فقط |
| Tables | dense tables، pagination، filters، search، sort | Server pagination/filter/sort؛ لا تنزيل dataset كامل |
| Identity | Student/Faculty profile hero، status badges | DTOs scoped من الـAPI |
| Academic | enrollment history، roster membership، groups، requirement context | Read models خادمية مستقلة ومحددة |
| Clinical | case table، workflow timeline، decision panel، grade panel، revision history | State machine وauthorization في Backend فقط |
| Supervisor | assignment switcher، action-first mobile views | Assignment IDs مخولة من endpoint خادمي |
| Reporting | report tabs، CSV actions | Aggregate/scoped server reports وserver-generated exports |
| Settings | tabs/forms للحسابات والهيكل والسياسات والbranding | APIs إدارية مستقلة؛ لا local mutation |
| Print | A4 roster/register styles | Dedicated print stylesheet بعد server-scoped data |

## جرد البيانات المحلية المطلوب إزالتها من Runtime

المصدر `data.js` وملحقاته يستخدمون المجموعات التالية كمصدر حقيقة محلي:

- `university`
- `academicStructure`
- `departments`
- `faculty`
- `students`
- `enrollments`
- `rosters`
- `rosterMemberships`
- `academicGroups`
- `groupMemberships`
- `departmentDistributionPolicies`
- `supervisorAssignments`
- `assignmentTransfers`
- `requirementSets`
- `gradingPolicies`
- `caseSheetTemplates`
- `clinicalWorkflowPolicies`
- `cases`
- `studentDrafts`
- `submissionSnapshots`
- `studentEvents`
- `notifications`
- event/revision/note arrays داخل سجلات الحالات.

كل عنصر مؤسسي أو أكاديمي أو سريري في هذه القائمة يجب أن يأتي من API/PostgreSQL. المسموح محليًا فقط هو UI state مثل الفلتر المفتوح، تبويب العرض، dialog الحالي، وحالة الطلب.

## جرد الـmock functions والسلطة العميلية

| المجال | الدوال/الآليات المحلية في v7 | قرار النقل |
| --- | --- | --- |
| Authentication | `enterPortal`, `setRole`, `setAccount`, account switcher | حذف كامل؛ Session principal من Backend فقط |
| IDs/Audit | `Date.now()`, `Math.random()`, push إلى events/history | حذف كامل؛ IDs والتدقيق من Backend transaction |
| Students | `saveStudentRecord`, `saveEnrollment`, `archiveStudentRecord`, `createOrTransitionEnrollment` | استبدال بأوامر API بعد إضافتها |
| Rosters | `saveMembership`, `removeMembership`, `importRoster`, `previewRosterFile`, `exportRoster` | validation/preview/commit/export خادمية |
| Groups | `setDepartmentDistribution`, `createAcademicGroup`, `renameAcademicGroup`, `defineGroupRange`, `assignDepartmentGroupsByRange`, `assignGroupMembership`, `removeGroupMembership`, `archiveAcademicGroup` | لا يبقى منها Business Logic في Client |
| Faculty | `saveSupervisor`, `saveAccount`, `toggleAccountStatus`, `regenerateInvite`, `cancelInvitation` | استبدال بـaccount/invitation APIs مخولة |
| Assignments | `createSupervisorAssignment`, `updateSupervisorAssignment`, `endSupervisorAssignment`, `transferSubmittedCase` | استبدال بـcommand APIs ذرية |
| Workflow | `createClinicalWorkflowPolicyVersion`, `freezeWorkflowForNewSubmission`, `confirmDecision` | policy/state machine في Backend فقط |
| Grading | `saveGrade`, `saveBulkGrades`, local max/status checks | Client UX validation فقط؛ Backend يقرر الأهلية والحد والقفل |
| Notes | `addNote` | endpoint مستقل بسياسة ظهور واضحة |
| Requirements | `saveRequirementSet`, `createRequirementVersion`, `transitionRequirementSet`, item mutation، `saveGradePolicy` | versioned aggregate APIs فقط |
| Reports | `reportInsights`, `aggregateReportTable`, `exportCSV`, `exportReport`, `exportCases` | query/export خادمي scoped |
| Settings | `saveUniversitySettings`, `saveBrandingSettings`, `saveWorkflowSettings`, `saveStructureItem`, `saveDepartment` | APIs إدارية؛ لا mutation محلية |
| Permissions | `window.PortalPermissions.canPerform()` و`role().pages` | Presentation hints فقط؛ لا تمنح وصولًا ولا تجيز فعلًا |

## الصلاحيات المستخدمة في v7 ومقابلها الإنتاجي

| Permission في v7 | الاستخدام | مقابل Phase 1 الفعلي | الحالة |
| --- | --- | --- | --- |
| `accounts.manage` | الحسابات والدعوات | `invitations:issue` فقط | `PARTIAL API` |
| `faculty.manage` | إنشاء/تعديل المشرفين | لا endpoint | `API GAP` |
| `roster.manage` | الطلاب والتسجيل والكشوف | `close enrollment` فقط | `PARTIAL API` |
| `groups.read` | عرض المجموعات | لا list/read endpoint | `API GAP` |
| `groups.manage` | policy/group/membership | assign/move membership فقط | `PARTIAL API` |
| `assignments.read` | عرض التكليفات | لا endpoint | `API GAP` |
| `assignments.manage` | create/update/end/transfer | لا endpoint | `API GAP` |
| `requirements.manage` | draft/version/items/policy | لا endpoint | `API GAP` |
| `requirements.publish` | publish/archive | لا endpoint | `API GAP` |
| `cases.reassign` | تحويل الحالة | لا endpoint | `API GAP` |
| `case.review` | قراءة وقرارات سريرية | GET by ID + revision + approve start/final | `PARTIAL API` |
| `case.grade` | grade/amend | grade command | `PARTIAL API` |
| `case.note` | ملاحظات المشرف | لا endpoint | `API GAP` |
| `reports.export` | CSV وتقارير مفصلة | aggregate-only read | `PARTIAL API` |
| `settings.manage` | إعدادات الجامعة | لا endpoint | `API GAP` |
| `structure.manage` | الأعوام/المستويات/الدفعات | لا endpoint | `API GAP` |
| `departments.manage` | الأقسام | لا endpoint | `API GAP` |
| `branding.manage` | الهوية البصرية | لا endpoint | `API GAP` |
| `department.settings.manage` | سياسة القسم | لا endpoint | `API GAP` |

الأدوار العميلية الموجودة في v7 هي University Admin وDepartment Admin وClinical Supervisor. يحتوي الـCore كذلك على `STUDENT_INTEGRATION`، لكنه ليس Persona لبوابة الموظفين ولا يجب عرضه كخيار تبديل دور.

## الواجهة القديمة → API الجديد → حالة النقل

| الترتيب | شاشة/تدفق v7 | البيانات المطلوبة | API Phase 1 المتاح | فجوة API المطلوبة | جاهزية الـAPI | حالة النقل |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login | organization، email، password | `POST /auth/login`, `GET /session`, `POST /auth/logout` | توحيد Session DTO/OpenAPI؛ تحديد Organization discovery أو إبقاء organizationId إدخالًا صريحًا | `CONTRACT BLOCKER` | `NOT STARTED` |
| 1 | Invite acceptance | organization، token، password | `POST /invitations/redeem` | Route UX فقط؛ لا حاجة لمنطق عميل | `API READY` | `NOT STARTED` |
| 1 | Invite issue | email، role | `POST /invitations` | list/revoke/regenerate/status للـFaculty UI | `PARTIAL API` | `NOT STARTED` |
| 2 | University Dashboard | year selector، totals، pending، department comparison، alerts | `GET /reports/aggregate?academicYearId=` | academic context catalog؛ department aggregates؛ assignment coverage؛ alerts؛ recent activity scoped | `PARTIAL API` | `NOT STARTED` |
| 2 | Department Dashboard/Workspace | department KPIs، levels/groups، rosters، assignments، cases، requirements | aggregate العام فقط | Department summary read model وبقية catalogs | `API GAP` | `NOT STARTED` |
| 3 | Students Directory | scoped students، search/filter/sort/page، enrollment summary | `GET /students?departmentId=` | pagination/search/sort؛ academic year/level/cohort filters؛ response schema دقيقة | `PARTIAL API` | `NOT STARTED` |
| 3 | Student Profile | identity، current/history enrollments، memberships، cases، progress، grades، lifecycle | لا detail endpoint | scoped student detail read model | `API GAP` | `NOT STARTED` |
| 3 | Student create/archive/reactivate | identity + revision/reason | لا endpoint | command APIs مع optimistic concurrency/audit | `API GAP` | `NOT STARTED` |
| 4 | Faculty/Supervisors Directory | accounts، status، scopes، invitation، workload | لا endpoint | paginated scoped faculty/account read model | `API GAP` | `NOT STARTED` |
| 4 | Supervisor/Account management | profile، role، department/year/level/cohort scopes، status | invitation issue فقط | create/update/disable/reactivate؛ invitation lifecycle | `API GAP` | `NOT STARTED` |
| 5 | Enrollment create/history | academic year، level، cohort، revision/status | close command فقط | list/detail/create/transition read/write APIs | `PARTIAL API` | `NOT STARTED` |
| 5 | Enrollment close | enrollment ID، revision، reason | `POST /enrollments/:id/close` | enrollment GET لازم للحصول على ID/revision والحالة الحالية | `PARTIAL API` | `NOT STARTED` |
| 5 | Rosters Directory/Detail | roster contexts، memberships، paging/filtering | لا endpoint | list/detail/membership APIs | `API GAP` | `NOT STARTED` |
| 5 | Roster CSV import/export/print | validation preview، commit، scoped export | لا endpoint | preview/commit/export server APIs وformula-injection protection | `API GAP` | `NOT STARTED` |
| 6 | Groups/Distribution | policy، groups، ranges، coverage، memberships | membership assign/move command فقط | context/list/detail/policy/group lifecycle/coverage/remove APIs | `PARTIAL API` | `NOT STARTED` |
| 6 | Supervisor Assignments | assignments، permissions، effective dates، full cohort/group scope | enforcement داخلي فقط | list/detail/create/update/end APIs وrevision | `API GAP` | `NOT STARTED` |
| 6 | Supervisor assignment switcher | assignments المخولة للمستخدم | لا endpoint | `GET /me/supervisor-assignments` scoped | `API GAP` | `NOT STARTED` |
| 7 | Student submission | draft ID، idempotency | `POST /student/submissions` | create/update/read draft؛ resubmission؛ attachment completion/linking | `PARTIAL API` | `NOT STARTED` |
| 7 | Staff Submissions List | submitted-only rows، filters، paging، waiting | GET by ID فقط | submitted-only list endpoint scoped server-side | `API GAP` | `NOT STARTED` |
| 7 | Submission Detail | snapshot payload، student/enrollment context، policy/version، history، attachments | GET by ID يعيد metadata محدودة | typed detail DTO دون كشف private drafts أو hidden notes | `PARTIAL API` | `NOT STARTED` |
| 8 | Review Queue | pending start/final/revision، waiting، assignment | لا list endpoint | review queue read model | `API GAP` | `NOT STARTED` |
| 8 | Review decisions | status/revision، reason، assignment permission | revision + approve start/final commands | reject/cancel إذا بقي ضمن المتطلبات؛ response/current state بعد mutation | `PARTIAL API` | `NOT STARTED` |
| 8 | Supervisor notes | note history/visibility policy | لا endpoint | scoped notes read/write DTOs | `API GAP` | `NOT STARTED` |
| 8 | Case reassignment | current assignment، successor، reason، revision | لا endpoint | explicit reassign command + history | `API GAP` | `NOT STARTED` |
| 9 | Grading | current grade، max snapshot، eligibility، comment | grade/amend command واحد | typed grade read/history؛ explicit amendment contract؛ bulk grading إذا اعتمد | `PARTIAL API` | `NOT STARTED` |
| 9 | Requirement Sets/Policies | versions، items، rubric، workflow/grading snapshots | لا endpoint | full versioned aggregate read/command APIs | `API GAP` | `NOT STARTED` |
| 9 | Term Results | closure state، revision، history | transition commands only | list/detail/readiness/history؛ لا مرجع شاشة في v7 | `REFERENCE GAP` + `PARTIAL API` | `NOT STARTED` |
| 10 | Aggregate Reports | academic year totals | `GET /reports/aggregate` | academic year catalog؛ exact empty/error UX | `PARTIAL API` | `NOT STARTED` |
| 10 | Detailed Reports/CSV | department/period tabs، requirements، grading، workload | لا endpoint | scoped report DTOs وserver CSV export | `API GAP` | `NOT STARTED` |
| Supporting | File upload/read | type، size، checksum، authorized read | presign upload/read | upload completion، attachment linking، scan/status/retry | `PARTIAL API` | `NOT STARTED` |
| Supporting | Audit views | actor/action/entity/time/correlation | audit write داخلي فقط | scoped audit read endpoint إن بقي العرض ضمن v7 | `API GAP` | `NOT STARTED` |

## P0 Contract Blockers قبل Frontend Scaffolding

1. `SessionActorDto` في `packages/contracts` يعلن `collegeId`، بينما `GET /api/v1/session` وOpenAPI لا يعيدانه.
2. استجابات invitations، students، staff submission، file upload وfile read تستخدم `objectResponse` عامًّا في OpenAPI، فلا يمكن توليد typed client موثوق منها.
3. `GET /students` يعيد صفوفًا فعلية لا يقابلها Student DTO معلن في `@dentpilot/contracts`.
4. لا يوجد catalog endpoint للأعوام والمستويات والدفعات والأقسام؛ لذلك لا تستطيع الواجهة تكوين `academicYearId` أو scope selectors من مصدر خادمي.
5. لا توجد List APIs لمعظم الشاشات؛ وجود command endpoint لا يجعل الشاشة قابلة للعمل.
6. يجب تثبيت رمز الانتقال غير القانوني كما ينفذه الـCore: `ILLEGAL_TRANSITION` ضمن HTTP 409، وعدم بناء الواجهة على 422 غير الموجود.

إغلاق هذه النقاط يكون بعقود وإضافات API داخل حدود الـmodular monolith الحالية، من دون نقل authorization أو validation أو state machine إلى Frontend.

## Frontend Architecture المعتمدة للتنفيذ

تُحفظ التقنية الحالية: **React 19 + TypeScript strict + Vite**. لا توجد حاجة معمارية للانتقال إلى Next.js؛ البوابة Client فقط والـBackend الحالي هو السلطة.

```text
apps/web/src/
  app/                 # providers, router, layouts, error boundary
  api/                 # generated/typed client, csrf, request/error handling
  auth/                # session query, login/logout, access states
  components/          # shared accessible components
  design-system/       # tokens, RTL, tables, forms, dialogs, print
  features/
    dashboard/
    students/
    supervisors/
    enrollments/
    rosters/
    groups/
    assignments/
    submissions/
    reviews/
    grading/
    requirements/
    term-results/
    reports/
  routing/
  utils/
```

### قواعد التنفيذ

- كل request يستخدم `credentials: 'include'`.
- Mutation requests تقرأ cookie `dp_csrf` وترسل `x-csrf-token`؛ لا يُخزن token في localStorage.
- Session state تأتي من `GET /api/v1/session` وتبقى في الذاكرة/Query cache فقط.
- 401 ينهي session client state ويعيد إلى Login؛ 403 يعرض Access Denied؛ 409 يعرض refresh/reconcile مع حفظ النص غير المرسل عند الإمكان.
- Role/scope-based navigation Presentation فقط؛ كل route وrequest يظل خاضعًا للBackend وRLS.
- لا يتم تمرير tenantId أو role أو permission كسلطة من Client.
- IDs وrevision وavailable transitions تأتي من DTOs الخادمية.
- لا optimistic success للدرجات أو الاعتمادات أو الإغلاق أو إعادة الإسناد.
- كل list كبير يستخدم server pagination/filter/sort بمفتاح ترتيب حتمي.
- لا يُستورد أي ملف من Prototype إلى Production runtime. تُستخلص tokens والأنماط بصريًا ثم يعاد بناؤها.

## ترتيب التنفيذ المقترح بعد إغلاق P0

| الأولوية | Vertical Slice | شرط البدء | معيار الاكتمال |
| --- | --- | --- | --- |
| P0 | Contract foundation | Session/Student/Submission/File DTOs وOpenAPI دقيقة | generated/typed client يطابق integration contract tests |
| P0 | Authentication | contract foundation | Login → cookie session → restore → logout → PostgreSQL audit |
| P0 | Scope catalogs | departments/years/levels/cohorts endpoints | selectors لا تستخدم constants محلية |
| P1 | Dashboard | aggregate + context catalogs | UI → API → PostgreSQL، مع aggregate privacy test |
| P1 | Students | paginated list + detail read model | scope/tenant negative tests من UI وAPI |
| P1 | Supervisors | faculty read model + account/invite lifecycle | role/scope tests وdisabled-account behavior |
| P1 | Enrollment/Rosters/Groups | read models قبل commands | create/close/move/import flows transactionally verified |
| P1 | Assignments | list/detail/commands | supervisor switch resets cache ولا يعرض stale scope |
| P1 | Submissions | draft/read/list/detail/attachment completion | private draft isolation وimmutable snapshot E2E |
| P1 | Review | queue + detail + commands | forbidden transitions/assignments return 403/409 |
| P1 | Grading | grade read/history + commands | eligibility/max/amendment/lock/audit E2E |
| P2 | Reports | report DTOs + server CSV | no identity leakage in aggregate، scoped export |
| P2 | Term Results | read model + UX specification | review/approve/lock/reopen + reason/history/audit E2E |

## اختبار كل وحدة

لا تُصنف أي وحدة Complete إلا بعد نجاح الطبقات الثلاث:

1. API contract/integration: schema، database transaction، authorization، RLS، state transition.
2. Permission negative path: tenant، organization، department، academic year، level/cohort/group، assignment، role.
3. UX/E2E: loading، empty، validation، forbidden، expired session، conflict، retry، keyboard/RTL.

## Production Acceptance المطلوبة

| القبول | الإثبات المطلوب |
| --- | --- |
| Student isolation | طالب/موظف خارج النطاق لا يحصل على identity أو draft أو submission عبر list أو ID مباشر |
| Supervisor scope | assignment غير فعال أو بلا permission يمنع القراءة والفعل؛ تبديل assignment يمسح البيانات القديمة |
| Department scope | Department Admin لا يقرأ أو يعدل قسمًا آخر حتى مع URL/ID صحيح |
| Organization isolation | جلستان من مؤسستين منفصلتين + RLS negative tests |
| Forbidden actions | UI تعرض 403 بوضوح، والـAPI تبقى الحاجز الفعلي |
| State transitions | transitions غير القانونية تفشل 409 ولا تغيّر projection أو audit |
| Term lock | grade/amendment/result mutations تفشل بعد lock حتى من UI متلاعب بها |
| Audit creation | كل mutation حساسة تنتج audit event داخل transaction نفسها |

## قرار بدء التعديل

- تحليل v7: **COMPLETE**.
- خريطة الواجهة إلى API: **COMPLETE**.
- Frontend Architecture: **IMPLEMENTED**.
- تعديل ملفات Frontend: **IMPLEMENTED** ضمن `apps/web` فقط.
- تعديل Core: **NOT PERFORMED**.
- تقرير التنفيذ: `PHASE_2B_MIGRATION_REPORT.md`؛ لا يعلن End-to-End Complete قبل إثبات UI → API → PostgreSQL في بيئة القبول.
