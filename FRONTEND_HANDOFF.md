# DentPilot — Frontend Handoff Guide

**الغرض:** تسليم النسخة الحالية إلى مهندس آخر لمرحلة Integration وربط الأنظمة، دون إعادة فهم المشروع من الصفر.

**تاريخ المراجعة:** 05 سبتمبر 2026

## 1. حدود هذه المراجعة

تمت مراجعة Frontend Architecture، المسارات، المكونات المشتركة، Design System، فصل الأدوار، نقاط التكامل، الملفات القديمة، ومواضع inline styles. لم يتم تعديل Backend أو Database أو Contracts أو الصلاحيات أو Workflow. التنظيف الوحيد المنفذ كان تحويل inline styles في `Supervisor Case Detail` إلى أصناف CSS ثابتة، مع الحفاظ على نفس التخطيط والسلوك.

## 2. خريطة Frontend

التطبيق موجود في `apps/web/src` ويستخدم React + TypeScript + Vite مع hash routing. نقطة الدخول العملية للمساحات المسجلة هي `apps/web/src/app/portal-app.tsx`، بينما عميل HTTP typed موجود في `apps/web/src/api/client.ts`، وحالة الموارد المشتركة في `apps/web/src/api/use-resource.ts`.

| المجلد | المسؤولية |
|---|---|
| `app/` | جلسة البوابة، Portal Shell، role navigation، وتوزيع المسارات على الصفحات. |
| `api/` | typed API client، أخطاء API، وresource loading/reload lifecycle. |
| `auth/` | استعادة الجلسة وتحديد actor الحالي. |
| `routing/` | hash route parser و`navigate`. |
| `components/` | Shared UI primitives: headers، states، badges، fields، tables، pagination، metrics. |
| `features/dashboard/` | Control Dashboard والمؤشرات التي يعيدها الخادم. |
| `features/students/` | Student Directory وStudent Academic Profile للقراءة. |
| `features/control/` | Supervisor Directory/Profile، Schedule Management، Clinical Operations. |
| `features/catalogs/` | الأقسام والمجموعات والمرجع الأكاديمي. |
| `features/assignments/` | نطاقات وتكليفات الإشراف الحالية. |
| `features/supervisor/` | Supervisor Home، Daily Sheet، Queue، History، Summary، Case Detail والنماذج السريرية. |
| `features/submissions/` | Staff Submissions القديمة التي تحتوي أفعالًا سريرية؛ ليست جزءًا من Control Navigation الحالي. |
| `features/reports/` | التقارير التشغيلية الحالية. |
| `styles.css` | Design Tokens، Shell، Control، Supervisor Mobile، الحالات، الجداول، والصفحات الداخلية. |

## 3. المسارات الرئيسية

المسارات يفسرها `portal-app.tsx`، ومساحة المشرف تستخدم router داخليًا في `supervisor-workspace.tsx`.

| المسار | المساحة | الصفحة |
|---|---|---|
| `/dashboard` | Control | Dashboard حسب نطاق الدور والسنة والقسم. |
| `/students` | Control | Student Directory read-only. |
| `/students/:id` | Control | Student Academic Profile read-only. |
| `/departments` | Control | مرجع الأقسام والبرامج. |
| `/groups` | Control | المجموعات والتسجيلات. |
| `/control/supervisors` | Control | Supervisor Directory read-only. |
| `/control/supervisors/:id` | Control | Supervisor Administrative Profile read-only. |
| `/control/schedules` | Control | Schedule Directory read-only. |
| `/control/schedules/:id` | Control | Schedule Detail read-only. |
| `/control/clinical-operations/cases` | Control | Case Registry read-only. |
| `/control/clinical-operations/reviews` | Control | Review Monitoring read-only. |
| `/control/clinical-operations/cases/:id` | Control | Case Detail administrative read-only. |
| `/assignments` | Control | نطاقات الإشراف. |
| `/reports` | Control | التقارير الحالية. |
| `/supervisor` | Supervisor | Supervisor Home. |
| `/supervisor/daily-sheet` | Supervisor | Daily Sheet. |
| `/supervisor/queue` | Supervisor | Review Queue. |
| `/supervisor/history` | Supervisor | History read-only. |
| `/supervisor/summary` | Supervisor | Work Summary read-only. |
| `/supervisor/cases/:id` | Supervisor | Case Detail التشغيلي، وتظهر الأفعال من `allowedActions`. |
| `/student` | Student | حالة مساحة الطالب الحالية؛ التطبيق الطلابي مستقل تشغيليًا. |

## 4. فصل الأدوار والمساحات

### Control

Control هو مساحة الإدارة الأكاديمية والتشغيلية على سطح المكتب. تعرض Dashboard، الطلاب، الأقسام، المجموعات، المشرفين، الجداول، النطاقات، Clinical Operations والتقارير. الصفحات الحالية في Clinical Operations إدارية للقراءة فقط؛ لا تعتمد على Supervisor Queue ولا تعرض أفعال اعتماد أو تقييم.

### Supervisor

Supervisor Workspace مساحة تشغيل سريري Mobile-first. `Daily Sheet` يعرض اليوم والمناوبة، `Review Queue` يعرض الأعمال المتاحة والمؤجلة، `History` للعرض التاريخي، `Summary` للقراءة والتحليل، و`SupervisorCaseDetail` ينفذ الإجراءات التي يعيدها الخادم ضمن `allowedActions`. يجب عدم نقل أفعال Supervisor إلى Control.

### Student

الحساب الطلابي موجود في navigation ومسار `/student`، لكن التطبيق الطلابي التشغيلي مستقل. لا ينبغي بناء تجربة طالب كاملة داخل Control أو Supervisor، ولا إضافة draft/submission workflows إلى هذه البوابة دون قرار تكاملي صريح.

## 5. Shared UI وDesign System

المكونات المشتركة موجودة في `apps/web/src/components/ui.tsx`:

- `PageHeader` لتوحيد eyebrow والعنوان والوصف والإجراءات.
- `LoadingState`, `EmptyState`, `ErrorState` للحالات المشتركة.
- `StatusBadge` لعرض الحالات القادمة من العقود.
- `Pager` للصفحات الخادمة.
- `MetricCard` للمؤشرات.
- `Field` للفلاتر والحقول.
- `DataTable` لتوحيد غلاف الجداول وclass `data-table`.

`styles.css` هو المصدر المركزي للغة التصميم. يحتوي على CSS custom properties للألوان والمسافات والظلال وأنصاف الأقطار، ثم قواعد Shell وControl وSupervisor. لا تضف نظام تصميم موازيًا داخل صفحة جديدة؛ استخدم primitives وtokens الحالية.

## 6. نقاط التكامل مع Backend

عميل API typed في `apps/web/src/api/client.ts` هو نقطة الربط الرئيسية. يجب أن يبقى كل استدعاء صفحة عبر `api.*` و`useResource`، وألا تستدعي الصفحات `fetch` مباشرًا أو تكرر معالجة أخطاء HTTP.

| المساحة | استدعاءات أساسية | ملاحظات التكامل |
|---|---|---|
| Session | `api.session`, `api.logout` | actor والدور والنطاق تأتي من الخادم. |
| Catalogs | `departments`, `academicYears`, `academicLevels`, `cohorts`, `groups` | تستخدم لحل labels مساعدة فقط؛ لا تستنتج صلاحيات. |
| Students | `students`, `student` | العقود الحالية read-only وتعيد IDs للتسجيلات والعضويات. |
| Control Supervisors | `controlSupervisors`, `controlSupervisorDetail`, `controlSupervisorGrants` | الواجهة الحالية read-only؛ mutations الموجودة في client ليست جزءًا من navigation الحالية. |
| Schedules | `controlSchedules`, `controlScheduleDetail` | العرض الحالي read-only. |
| Control Clinical Operations | `submissions`, `submission` | يعتمد على staff submissions contract العام؛ لا يوجد Control-specific read model مستقل. |
| Supervisor | `supervisorCapabilities`, `supervisorDailySheet`, `supervisorReviewQueue`, `supervisorHistoryDay`, `supervisorWorkSummary`, `supervisorCaseDetail` | الإجراءات تعتمد على server capabilities و`allowedActions`. |
| Legacy Staff Submissions | `requestRevision`, `approveStart`, `approveFinal`, `grade`, `presignRead` | موجودة في `submissions-page.tsx` القديمة، ويجب عدم إعادة ربطها بتنقل Control دون قرار. |

## 7. البيانات المؤقتة والـFallbacks

لا توجد بيانات مؤقتة مقصودة أو mock datasets في الصفحات الأساسية. القيم مثل `غير محدد` و`—` هي fallbacks عرضية عند غياب قيمة nullable أو عند فشل catalog مساعد، وليست بيانات أعمال مخترعة.

في `Student Academic Profile` يمكن أن تظهر معرفات المجموعة والقائمة لأن العقد يعيد IDs دون أسماء. في `Control Clinical Operations` يعرض النظام payload كـimmutable snapshot، ولا يحوله إلى أسماء مواد أو حقول سريرية غير مضمونة.

Supervisor Summary يعرض فقط counters الموجودة في `SupervisorWorkSummaryDto`. أي عدد طلاب أو حالات أو نطاق زمني غير موجود في العقد يجب ألا يضاف من الواجهة.

## 8. ما يجب أن يعرفه مهندس Backend

1. `Control Clinical Operations` يحتاج مستقبلًا إلى read model إداري مستقل إذا كان المطلوب بحث نصي أو أسماء المادة والمشرف أو حالات مراجعة إدارية أكثر دقة.
2. `DEPARTMENT_ADMIN` يحتاج اختبارًا وعقد نطاق واضحًا لقراءة الحالات؛ الواجهة لن تعالج فجوة Authorization محليًا.
3. `Student Import` غير موجود؛ يلزم عقد validation وduplicate handling وreconciliation وaudit قبل بناء شاشة الاستيراد.
4. `StudentDetailDto` يعيد `groupId` و`rosterId` دون أسماء؛ لا تعتمد الواجهة على استخراج أسماء من payload أو IDs.
5. Attendance غير موجود كعقد أو capability؛ لا تظهر الواجهة أي حضور.
6. Supervisor capabilities يجب أن تبقى صريحة من الخادم. لا تستنتج React أفعالًا من role فقط.
7. Control Supervisor وSchedule pages الحالية read-only؛ أي CRUD يتطلب lifecycle وscope وaudit contracts منفصلة.
8. المرفقات في Control تعرض metadata فقط؛ لا يوجد في هذه المساحة رابط قراءة أو تنزيل مقصود.

## 9. الملفات الأهم للتسليم

| الملف | سبب الأهمية |
|---|---|
| `apps/web/src/app/portal-app.tsx` | مصدر role navigation وroute dispatch وroute visibility. |
| `apps/web/src/api/client.ts` | كل عقود استدعاءات Frontend الحالية. |
| `apps/web/src/components/ui.tsx` | Shared UI primitives. |
| `apps/web/src/styles.css` | Design System المركزي. |
| `apps/web/src/features/supervisor/supervisor-workspace.tsx` | router الداخلي لمساحة المشرف. |
| `apps/web/src/features/supervisor/supervisor-case-detail.tsx` | نقطة الإجراءات السريرية التي تعتمد على allowedActions. |
| `apps/web/src/features/control/clinical-operations-page.tsx` | Control Case Registry وReview Monitoring وCase Detail. |
| `apps/web/src/features/students/students-page.tsx` | Student Directory وAcademic Profile. |
| `apps/web/src/features/submissions/submissions-page.tsx` | Legacy staff workflow ذو الأفعال؛ يحتاج الحذر عند أي إعادة تنظيم. |
| `packages/contracts/src/index.ts` | مصدر DTOs المشتركة، ولا يجب تغييره في مرحلة Handoff. |
| `apps/api/src/security/authorization.ts` | المرجع الحقيقي للصلاحيات والنطاق. |

## 10. التنظيف الآمن المنفذ

تم تحويل موضعي inline styles في `supervisor-case-detail.tsx` إلى:

- `.supervisor-case-detail-layout`
- `.supervisor-case-actions`

داخل `styles.css`. لم يتم حذف ملفات أو إعادة تسمية ملفات أو تغيير imports أو paths لأن الملفات الحالية مرتبطة بالـrouting أو بالـlegacy workflows، وإزالة أي منها دون اختبار تكاملي مخصص قد تكسر مسارًا موجودًا.

## 11. ما يجب عدم تغييره أثناء Integration

لا تغير `AccountRole` أو role navigation أو `routeIsVisible` باعتبارها بديلًا عن Authorization. لا تنقل الإجراءات السريرية إلى Control، ولا تستنتج `allowedActions` من الدور، ولا تضف حقولًا من payload غير معرّفة في contracts، ولا تستبدل `useResource` بمعالجة محلية مختلفة، ولا تنشئ API calls مباشرة داخل الصفحات.

كما يجب عدم تغيير `packages/contracts` أو `apps/api/src/security/authorization.ts` ضمن عمل Frontend Handoff، وعدم إضافة Import أو Attendance أو CRUD قبل تثبيت عقود Backend والاختبارات الخاصة بها.

## 12. جودة الكود والمخاطر المتبقية

البنية واضحة وقابلة للتسليم، والمكونات المشتركة مستخدمة في الصفحات الرئيسية، ولم تعد توجد inline styles داخل `apps/web/src` بعد التنظيف الآمن. توجد بعض الأنماط المتكررة على مستوى JSX في صفحات الجداول لأن كل صفحة تحتاج أعمدة مختلفة؛ لا يوصى بتجريدها إلى DataTable generic أكثر تعقيدًا قبل تثبيت عقود البيانات.

الملف القديم `submissions-page.tsx` ليس غير مستخدم بالكامل؛ ما زال route dispatch يربطه بمسارات legacy، ولذلك لم يحذف. ملفات `evaluation-form.tsx` و`feedback-form.tsx` مستخدمة من `supervisor-case-detail.tsx`، وليست orphan components.

النقطة الرئيسية التي يجب متابعتها ليست Frontend syntax، بل contract readiness: Control clinical read model، Department Admin case scope، Student Import، Attendance، وأسماء المجموعات والقوائم.

## 13. نتائج التحقق

| الفحص | النتيجة |
|---|---|
| `npm run typecheck` | **PASSED** |
| `npm run lint` | **PASSED** |
| `npm run build` | **PASSED** |
| Unit tests | **130 passed، 0 failed، 0 skipped** |
| Integration tests | **68 passed، 0 failed، 0 skipped** |
| `npm test` | **PASSED — 198 اختبارًا** |
| Inline styles scan | **لا توجد نتائج متبقية داخل `apps/web/src`** |

ظهر أثناء الاختبارات log أمني متوقع من اختبار تعارض grants باسم `no_overlapping_active_grants`، لكنه لم يفشل أي اختبار.

## 14. توصية التسليم

النسخة جاهزة للتسليم إلى مهندس Integration باعتبارها **Frontend Reference Snapshot**. يوصى أن يبدأ المهندس التالي بقراءة هذا الملف، ثم `portal-app.tsx` و`api/client.ts` و`components/ui.tsx` و`styles.css`، وبعد ذلك يراجع contracts وAuthorization في Backend قبل أي توسيع وظيفي.

لا يوجد commit أو push ضمن هذه المرحلة.
