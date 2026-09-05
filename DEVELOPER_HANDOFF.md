# DentPilot — Developer Handoff

**الحالة:** نسخة مستقرة جاهزة لمرحلة Deployment وIntegration، مع الحفاظ على فصل Control وSupervisor وStudent.

## المعمارية الحالية

المشروع monorepo TypeScript: React/Vite في `apps/web`، وFastify في `apps/api`، وعقود مشتركة في `packages/contracts`، وقواعد Domain في `packages/domain`. تستخدم الواجهة عميل API typed واحدًا في `apps/web/src/api/client.ts`؛ ولا تمنح navigation أي صلاحية.

| دور المنتج | المعرّف التقني | المساحة |
|---|---|---|
| CONTROL | `UNIVERSITY_ADMIN` | Control Portal للإدارة والمتابعة المؤسسية. |
| CLINICAL_SUPERVISOR | `CLINICAL_SUPERVISOR` | Supervisor Workspace اليومي وفق assignment وcapabilities و`allowedActions`. |
| STUDENT | `STUDENT_INTEGRATION` | Student Application مستقل لملكية drafts والتسليمات الذاتية. |

`DEPARTMENT_ADMIN` ليس دور منتج معتمدًا. لا تعرضه Portal كمساحة تشغيلية ولا تنشئ integrations جديدة له. إزالته التقنية النهائية من Backend/Contracts/seed تحتاج change مستقلة مع migration واختبارات.

## ما أُنجز

- **Control Portal:** Dashboard، الطلاب والملف الأكاديمي، المشرفون، الجداول، النطاقات، Clinical Operations للقراءة، والتقارير.
- **Supervisor Workspace:** Home، Daily Sheet، Review Queue، History، Summary، وCase Detail بالإجراءات الخادمية فقط.
- **Student foundation:** Backend contracts لمسودات الطالب وتسليماته وملكيته الذاتية؛ تطبيق الطالب التشغيلي يبنى مستقلًا.
- **Design System:** tokens وshared primitives وحالات loading/empty/error وجداول متسقة، مع Control Desktop-first وSupervisor Mobile-first.
- **Role separation وHandoff:** موثقان في `ROLE_MODEL_INTEGRATION_HANDOFF.md` و`FRONTEND_HANDOFF.md`.

## المطلوب من المبرمج التالي

1. **Deployment:** تشغيل Fastify وواجهة Vite أو reverse proxy، وإعداد TLS وdomain وhealth checks.
2. **Environment:** إعداد Secrets حقيقية لـPostgreSQL وMinIO وsession وCORS، وعدم استخدام قيم development.
3. **Data services:** تشغيل migrations وseed التجريبي فقط عند الحاجة، وإعداد Postgres/MinIO production مع backup/restore ومراقبة.
4. **Integration:** ضبط `VITE_API_BASE_URL` أو same-origin topology، مع CORS/cookies/CSRF، ثم اختبار الأدوار الثلاثة end-to-end.
5. **Student Application:** البناء على `/api/v1/student/*`، وتسجيل أي حاجة لعقد جديد كطلب Backend مستقل.

## ما لا يجب تغييره

- لا تنقل Backend Authorization أو assignment/capability logic إلى React.
- لا تعيد `DEPARTMENT_ADMIN` كدور منتج أو Persona أو navigation.
- لا تغيّر workflows أو `SubmissionStatus` أو contracts دون مراجعة Domain وAuthorization واختبارات integration.
- لا تنقل أفعال المشرف إلى Control أو Student، ولا تستنتج بيانات من `payload` غير المعرّفة في العقود.

## نقطة البدء

اقرأ `ROLE_MODEL_INTEGRATION_HANDOFF.md`، ثم `FRONTEND_HANDOFF.md`، ثم `packages/contracts/src/index.ts` و`apps/api/src/security/authorization.ts` و`apps/web/src/api/client.ts`.
