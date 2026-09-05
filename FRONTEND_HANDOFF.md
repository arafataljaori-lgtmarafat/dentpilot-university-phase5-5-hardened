# DentPilot — Frontend Handoff Guide

**الغرض:** تسليم النسخة الحالية لمهندس Integration دون إعادة فهم المشروع من الصفر.
**نموذج المنتج المعتمد:** `CONTROL` و`CLINICAL_SUPERVISOR` و`STUDENT` فقط.

> **قاعدة ثابتة:** Backend Authorization هو مصدر الحقيقة الوحيد. التنقل والـroute visibility ينظمان الواجهة فقط ولا يمنحان صلاحية.

## 1. خريطة Frontend

التطبيق في `apps/web/src` مبني بـReact وTypeScript وVite مع hash routing. `app/portal-app.tsx` هو مصدر Portal Shell وتنقل الأدوار وتوزيع الصفحات. `api/client.ts` هو عميل HTTP typed المركزي، و`api/use-resource.ts` يعالج lifecycle التحميل وإعادة التحميل.

| المجلد | المسؤولية |
|---|---|
| `app/` | Session shell، navigation، route dispatch. |
| `api/` | typed client، CSRF، timeout، unauthorized handling، resource lifecycle. |
| `auth/` | session restore/login/logout. |
| `routing/` | hash route parser و`navigate`. |
| `components/` | states، badges، fields، tables، pagination، metrics. |
| `features/dashboard` و`students` و`control` | Control Portal Desktop-first. |
| `features/supervisor` | Supervisor Workspace Mobile-first. |
| `features/submissions` | staff workflow legacy؛ ليس جزءًا من Control navigation الحالي. |
| `styles.css` | Design Tokens وShell وقواعد Control وSupervisor. |

## 2. نموذج الأدوار في الواجهة

| نموذج المنتج | المعرّف التقني | الواجهة |
|---|---|---|
| CONTROL | `UNIVERSITY_ADMIN` | Control Portal. |
| CLINICAL_SUPERVISOR | `CLINICAL_SUPERVISOR` | Supervisor Workspace. |
| STUDENT | `STUDENT_INTEGRATION` | Student Application المستقل؛ Portal يعرض حالة فصل فقط. |

`DEPARTMENT_ADMIN` ليس persona معتمدًا في المنتج النهائي. بقي تقنيًا في Backend/Contracts مؤقتًا، لكن Portal لا يقدّم له navigation أو routes تشغيلية؛ الحساب التاريخي يرى حالة مواءمة فقط. لا تحذف enum أو تعديل Authorization ضمن عمل Frontend دون change Backend مستقلة.

## 3. المسارات الأساسية

| المساحة | المسارات | الحدود |
|---|---|---|
| Control | `/dashboard`, `/students`, `/departments`, `/groups`, `/control/supervisors`, `/control/schedules`, `/control/clinical-operations/*`, `/assignments`, `/reports` | قراءة ومتابعة مؤسسية حسب العقد والنطاق. |
| Supervisor | `/supervisor`, `/supervisor/daily-sheet`, `/supervisor/queue`, `/supervisor/history`, `/supervisor/summary`, `/supervisor/cases/:id` | أفعال سريرية فقط عبر `allowedActions` الخادمية. |
| Student | `/student` | حالة انتقالية داخل Portal؛ التطبيق التشغيلي مستقل ويستخدم `/api/v1/student/*`. |

Control Clinical Operations للقراءة فقط. لا يعيد استخدام Daily Sheet أو Review Queue ولا يعرض اعتمادًا أو تقييمًا أو ملاحظات المشرف.

## 4. قواعد التكامل

كل صفحة تستخدم `api.*` من `api/client.ts` و`useResource`. لا تضع `fetch` مباشرًا داخل صفحة، ولا تكرر معالجة HTTP أو session، ولا تستنتج صلاحيات من navigation. قيمة `VITE_API_BASE_URL` اختيارية؛ إن غابت يعمل العميل على same-origin. عند النشر المنفصل يجب ضبط API origin وCORS وcookies وCSRF معًا.

| المصدر | وظيفته |
|---|---|
| `packages/contracts/src/index.ts` | DTOs و`AccountRole` و`SubmissionStatus`. |
| `apps/api/src/security/authorization.ts` | permissions والنطاق الأكاديمي. |
| `apps/api/src/modules/cases/service.ts` | ملكية الطالب والانتقالات والسياسات. |
| `apps/api/src/modules/supervisor/service.ts` | duty/capabilities/allowed actions. |
| `apps/web/src/api/client.ts` | نقطة API الوحيدة للواجهة. |
| `ROLE_MODEL_INTEGRATION_HANDOFF.md` | النموذج التشغيلي النهائي للأدوار الثلاثة. |

## 5. حدود العقود الحالية

لا توجد mock datasets في الصفحات الأساسية؛ `غير محدد` و`—` fallbacks عرضية فقط. لا يستنتج Frontend اسم مادة أو مشرف أو حالة من `payload`. Student Profile قد يعرض IDs للمجموعة أو roster لأن العقود لا تعيد أسماءها. Control Clinical Operations يعتمد على `SubmissionListDto` و`SubmissionDetailDto` العامين، وليس Control-specific read model.

الحضور، Student Import، CRUD للمشرفين والجداول، Student Self Profile، Published Templates، Requirements، Resubmission، Notifications، Archive، وControl clinical read model الموسع ليست Features جاهزة لمجرد وجود جداول أو endpoints جزئية.

## 6. ما يجب عدم تغييره

لا تجعل navigation بديلًا عن Authorization، ولا تستنتج `allowedActions` في React، ولا تنقل أفعال المشرف إلى Control أو Student، ولا تعرض ملاحظات غير مرئية أو سجل grades الداخلي للطالب. لا تعيد إظهار `DEPARTMENT_ADMIN` في Portal أو تكوّن integrations أو seed accounts جديدة منه.

أي إلغاء نهائي للدور التاريخي من `AccountRole` أو permissions أو database seed يحتاج Backend/Contracts migration واختبارات منفصلة. لا ينفذ ضمن ربط الواجهة.

## 7. جودة النسخة

Design System مركزي في `styles.css`، وShared UI primitives في `components/ui.tsx`. Control Desktop-first وSupervisor Mobile-first. المسارات الأساسية مرتبطة من `portal-app.tsx` أو `supervisor-workspace.tsx`. ملف `submissions-page.tsx` قديم لكنه لا يزال مرتبطًا بمسارات legacy؛ لا يحذف دون قرار workflow واختبارات مخصصة.

## 8. نقطة البدء للمهندس القادم

اقرأ بالتسلسل: `ROLE_MODEL_INTEGRATION_HANDOFF.md`، ثم `portal-app.tsx`، ثم `api/client.ts`، ثم contracts وAuthorization وCases/Supervisor services. بعد ذلك فقط طابق endpoints مع البيئة الفعلية، واختبر Control وSupervisor وStudent end-to-end باستخدام الحسابات المعتمدة الثلاثة.
