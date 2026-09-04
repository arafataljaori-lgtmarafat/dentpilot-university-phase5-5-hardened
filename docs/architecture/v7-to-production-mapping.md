# v7 to Production Core Mapping

## قاعدة الترحيل

تُحفظ نسخة v7 في `reference/prototype-v7/` للقراءة فقط. لا تتحول ملفاتها إلى production code؛ بل تُترجم إلى موديولات خادمية وجداول وعقود واجهات مع ضمانات قاعدة البيانات. يصف العمود الأخير ما هو قابل للاستدعاء فعليًا في Phase 1؛ وجود جدول أو نموذج وحده لا يعني وجود Feature مكتملة.

| مفهوم v7 | تخزين Phase 1 | API المنفذة فعليًا | حالة Phase 1 الدقيقة |
| --- | --- | --- | --- |
| الصلاحيات والسياق | Accounts, scopes, assignments, RLS | يُطبق على كل endpoint مدرج في عقد API | منفذ ومختبر سلبياً على tenant/department/year/level/cohort/group/effective assignment |
| الطلاب والتسجيل | Students, Academic Enrollments | list students، close enrollment | منفذ لهذين الاستخدامين فقط؛ لا create/update API |
| الروسترات | Rosters, Roster Memberships | لا يوجد import/export endpoint | نموذج وقيود فقط؛ الاستيراد والتصدير غير منفذين |
| المجموعات | Distribution Policies, Groups, Memberships | assign/move membership | النقل منفذ؛ إدارة policy/group نفسها غير منفذة كـAPI |
| أعضاء هيئة التدريس | Faculty Profiles, Account Scopes | لا يوجد faculty-management endpoint | نموذج فقط |
| إسناد المشرف | Supervisor Assignments, Permissions | لا يوجد assign/revoke endpoint | نموذج وإنفاذ صلاحيات/تواريخ فقط |
| المتطلبات | Requirement Sets/Versions/Requirements | لا يوجد management endpoint | نموذج وimmutability للنسخ المنشورة فقط |
| سياسة العمل السريري | Workflow Policy Versions | لا يوجد configure/publish endpoint | نموذج ومرجع snapshot فقط |
| الحالات السريرية | Drafts, Case Sheets, immutable Snapshots, Decisions, Grade Events | submit، read staff، revision request، approve start/final، grade/amend | منفذ لهذه الأوامر؛ notes/resubmission management غير منفذين |
| التقييم الأكاديمي | Rubrics, Assessment Snapshots, Formula Versions, Summaries | لا يوجد assessment endpoint | نموذج فقط |
| إغلاق نتائج الفصل | Term Result Closures | reviewed/approved/locked/reopened | منفذ عبر أوامر صريحة وoptimistic locking |
| التقارير | Reporting query | aggregate report | aggregate فقط؛ CSV export غير منفذ |
| إعدادات المؤسسة | versioned policy tables | لا يوجد settings endpoint | نموذج فقط |
| الملفات | File Objects, Attachments | presign upload، presign read | الروابط الخاصة منفذة؛ completion/linking/scanning غير منفذة |
| التدقيق والأحداث | Audit Events, Outbox Events | internal append داخل المعاملات | الكتابة منفذة؛ outbox publisher/retry غير منفذ |

## الاختلافات المقصودة عن المرجع

يتحوّل `No Groups` في v7 إلى `FULL_COHORT`، ويظل المعنى أن عضويات Academic Group غير مسموحة. تتوقف Data arrays وLocalStorage وأرقام التعريف غير الآمنة والـbrowser permission checks عن الوجود خارج `reference/`. لا يقبل Production Core `tenantId` أو role أو permissions واردة من العميل لتقرير الصلاحية.

## مسار ترحيل البيانات لاحقًا

لا تربط Phase 1 أي بيانات كلية أو مريض حقيقية. يمكن في Phase 2 إنشاء importer منفصل ومراجعته، حيث يستقبل export مقننًا من v7 أو مصادر الكلية ويحوّله إلى staging validation ثم transaction قابلة للعكس. لا يُمنح frontend الاستيراد حق الكتابة المباشرة في جداول الإنتاج.
