# DentPilot University v7 — Prototype Behavior Inventory

## الغرض والمنهج

الأرشيف الموجود في `reference/prototype-v7/` هو **مواصفة تنفيذية مرجعية للوظائف وتجربة المستخدم**. لا تمثل متغيراته العامة أو المصفوفات العميلية أو `canPerform()` حدود أمان أو مصدر حقيقة للإنتاج. يحافظ Production Core على القواعد والسياقات والسجل التاريخي الموثق هنا، ويعيد تنفيذها في قاعدة بيانات PostgreSQL وخدمات خادمية ذات تفويض مركزي.

> القرار الحاكم: تُنقل **النية التجارية** وسلوك الانتقال القابل للملاحظة فقط؛ لا تُنقل آلية الحالة داخل المتصفح أو أرقام التعريف أو الصلاحيات التي يثق بها العميل.

## السلوكيات الحرجة المراد حفظها

| مجال v7 المرجعي | السلوك التجاري المطلوب حفظه | المصدر المرجعي | حد الإنتاج المقترح |
| --- | --- | --- | --- |
| النطاق المؤسسي | الجامعة والكلية والقسم نطاقات تشغيلية صريحة؛ الحساب لا يعمل خارج نطاقه. | `portal-domain.js`, `portal-permissions.js` | Organization/College/Department + principal سياقي + tenant-scoped repositories. |
| هوية الطالب والتسجيل | هوية الطالب دائمة ومستقلة عن Academic Enrollment؛ يمكن انتقال الطالب إلى مستوى/عام جديد مع حفظ التاريخ. | `portal-students.js` | `students` و`academic_enrollments` منفصلان؛ لا تعديل تاريخ التسجيل السابق. |
| الكشوف والعضوية | الـRoster مرتبط بسياق القسم/العام/المستوى/المجموعة، والعضوية سجل دورة حياة مستقل. | `portal-rosters.js`, `portal-students.js` | `rosters` و`roster_memberships` مع توافق enrollment وسجل إغلاق. |
| توزيع القسم | لكل سياق قسم إمّا Full Cohort أو Groups Enabled؛ لا توجد عضوية Group في Full Cohort. | `portal-groups.js` | `department_distribution_policies` وقيود DB/خدمة ذرية. |
| المجموعات | لا يتزامن للطالب عضوان نشطان في مجموعتين لقسم/سياق واحد، وتُرفض نطاقات التوزيع المتداخلة. | `portal-groups.js` | فهارس جزئية وقيود نطاق SQL وخدمة نقل ضمن transaction. |
| أعضاء هيئة التدريس | Faculty profile حساب مؤسسي قابل للتعطيل؛ لا يكفي الدور بغير scope. | `portal-faculty.js`, `portal-permissions.js` | Account status وfaculty profile وaccount scopes. |
| إشراف الحالات | assignment فعّال وضمن نطاق القسم/العام/المستوى/المجموعة يحدد مراجعة/تقييم الحالة؛ التاريخ محفوظ. | `portal-supervisor-assignments.js`, `portal-permissions.js` | `supervisor_assignments` و`assignment_permissions` وسجل تعيين/إلغاء. |
| المتطلبات | Requirement Set له نسخ وحالة draft/published/archive؛ تعديل المسودة لا يغير التعريف المنشور أو الحالات القديمة. | `portal-requirements.js` | versioned aggregate مع نشر ذري وقيد نسخة فعّالة. |
| سياسة الدرجات | سياسة الدرجات وصيغ النتائج تنسخ أو تُنسخ عند الاستعمال كي يبقى التاريخ قابلًا للتفسير. | `portal-requirements.js`, `portal-academic-assessment.js` | versioned policy + snapshots مراجع صريحة. |
| قالب الكاسشيت | قالب case sheet نسخة مؤرخة، ومحتوى المتطلبات الديناميكي يُحفظ snapshot عند الإرسال. | `portal-clinical-workflow.js`, `portal-cases.js` | `case_sheet_template_versions` و`submission_snapshots` غير قابلة للتحوير. |
| سياسة workflow | الاستحقاق والظهور والقرارات السريرية تحكمها policy version؛ تغييرها يخص الإرسالات المستقبلية فقط. | `portal-clinical-workflow.js`, `portal-cases.js` | `clinical_workflow_policy_versions` وsnapshot عند submit. |
| مسودة الطالب | مسودة الطالب الخاصة ليست مرئية لموظفي الكلية، ولا تصبح مرئية إلا عبر حد الإرسال المؤسسي. | `portal-cases.js`, `v059-submission-privacy-enforcement.test.cjs` | student boundary مستقل؛ لا تعيد staff APIs أي draft. |
| الإرسال | الإرسال ينشئ نسخة مجمدة تشمل الطالب والتسجيل والنطاق والسياسة والتكليف والمتطلبات والمرفقات والحمولة. | `portal-cases.js`, `portal-domain.js` | transaction يحدد assignment الفعال ويكتب `submission_snapshots` append-only. |
| المراجعة والتعديل | revision طلب مستقل؛ resubmission نسخة جديدة مرتبطة بسابقتها ولا تُعدل النسخة السابقة. | `portal-cases.js`, `portal-clinical-workflow.js` | chain بـ`resubmission_of_snapshot_id` وانتقالات حالة صريحة. |
| القرارات السريرية | قرارات مثل approve start/final تخضع للrole والscope وassignment permission وpolicy والحالة. | `portal-cases.js`, `portal-permissions.js` | command endpoints + AuthorizationService + state machine. |
| ملاحظات المشرف | ملاحظات المشرف مملوكة للسياق ولا تُكشف إلى الطالب إلا وفق policy صريح. | `portal-cases.js` | `supervisor_notes` وحدود DTO منفصلة. |
| تقييم الحالة | الدرجة محكومة بحد أقصى/rubric، والتعديل يستلزم سببًا ويحفظ القيمة السابقة. | `portal-cases.js`, `portal-academic-assessment.js` | `grade_events` append-only وgrade projection محكومة. |
| تقييم أكاديمي | rubric والتقييمات والملخصات تستخدم snapshots ومصادر درجات قابلة للتتبع. | `portal-academic-assessment.js` | `assessment_rubric_versions`, `assessment_snapshots`, `student_assessment_summaries`. |
| النتائج النهائية | نتيجة الترم تمر عبر draft/review/approve/lock/reopen؛ reopen يتطلب سببًا وسجلًا. | `portal-term-results.js` | `term_result_closures` state machine، وقفل يمنع التعديل الصامت. |
| التقارير | تقارير مستوى الجامعة aggregate-only عند القصد؛ لا تُخفى هوية الطالب في العميل بعد تحميلها. | `portal-reports.js` | aggregate DTO/query خادمي لا يحتوي student identifiers. |
| CSV | استيراد roster يعرض validation/preview ثم commit ذري؛ export محكوم بالنطاق ويعالج formula injection. | `portal-rosters.js`, `portal-reports.js` | import preview/commit، CSV sanitation، audit export. |
| السجل التدقيقي | أحداث الإعدادات والدورة الأكاديمية والإجراءات السريرية تُسجل بسياق الممثل والزمن والهدف. | جميع وحدات المجال و`portal-reports.js` | `audit_events` append-only محمي على مستوى DB. |

## مصفوفة الصلاحيات المرجعية

يبيّن `portal-permissions.js` أن قرار الفعل يجمع حالة الحساب، permission، نطاق القسم، وحالة السجل، مع scope إشراف محدد وpermission على assignment للقرارات السريرية. ينقل Production Core هذه القاعدة إلى Policy/Authorization Service مركزي؛ لا تقبل API دورًا أو permission أو tenant من العميل كحقيقة.

| الفاعل | أمثلة أفعال مقصودة | قيود إلزامية في الإنتاج |
| --- | --- | --- |
| University Admin / Control | إدارة البنية والسياسات والنتائج الكلية والتقارير المجمعة | نفس tenant، صلاحية صريحة، ولا تنكشف هوية الطلاب في aggregate-only contracts. |
| Department Admin | roster/requirements/groups ضمن قسمه | department scope، السياق الأكاديمي، وتوافق enrollment/group/roster. |
| Clinical Supervisor | رؤية submission موجه له، مراجعة أو تقييم | assignment فعّال يطابق scope، و`reviewCases` أو`grade` كما يلزم، وحالة workflow. |
| Student integration principal | المسودة الخاصة والإرسال والحالة/feedback المنشور فقط | طالب مالك للسجل، لا notes داخلية ولا سياسات غير منشورة ولا control data. |

## حواجز يجب ألا تضيع في الترحيل

| حاجز | سبب الحماية | اختبار إنتاجي لازم |
| --- | --- | --- |
| Tenant isolation | منع قراءة/تعديل/تخمين معرفات مؤسسة أخرى. | Actors A/B مع IDs معروفة ومخمنة ومخرجات export. |
| Submission privacy | منع staff من رؤية draft أو الوصول إليه بـIDOR. | staff list/get لا يعيد draft؛ الطالب فقط يرى مسودته. |
| Historical snapshots | إبقاء السياسة والمتطلبات والتكليف قابلة للتفسير بعد تغير الإعدادات. | update/delete snapshot يُرفض DB وresubmission ينشئ صفًا جديدًا. |
| Grade history | منع تعديل الدرجات بلا سبب أو محو السابق. | amendment بلا سبب أو بلا permission يفشل ويحتفظ السابق. |
| Term lock | منع تعديل النتيجة بعد القفل. | mutation عند locked تفشل؛ reopen بسبب فقط. |
| Audit append-only | جعل التحقيق موثوقًا. | UPDATE/DELETE مباشرة عبر application role تفشل. |

## ملاحظات على الغموض والقرارات

يدعم المرجع قيمتي `No Groups` و`Groups Enabled`، فيما يصف prompt قيمة Full Cohort. يتبنى Production Core تسمية `FULL_COHORT` للمعنى التشغيلي لـ`No Groups`، و`GROUPS_ENABLED` للقيمة الثانية، مع توثيق الترجمة في خريطة v7-to-production. كما تستخدم الواجهة `Date.now()` و`Math.random()` لأرقام تعريف تجريبية؛ تُعد هذه آلية prototype محظورة تمامًا في الأمن والإنتاج، حيث ستتولى PostgreSQL/الخدمة معرفات UUID آمنة.

## المصدر والحدود

استُخلص الجرد من الوحدات المرجعية وفهارس الاختبارات المحفوظة محليًا، ومنها `portal-permissions.js`, `portal-groups.js`, `portal-students.js`, `portal-cases.js`, `portal-academic-assessment.js`, `portal-term-results.js`, واختبارات الخصوصية والمجموعات والتكليفات والـGradebook. تم حفظ فهرس الدوال المساند في `docs/architecture/reference-behavior-index.md`.
