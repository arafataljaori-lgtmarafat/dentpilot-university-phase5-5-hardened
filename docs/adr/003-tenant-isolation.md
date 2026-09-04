# ADR 003 — Tenant Isolation in Depth

## Context

المؤسسات يجب ألا تقرأ أو تعدّل أو تستنتج بيانات بعضها حتى عند تخمين UUID أو إرسال tenantId مزيف.

## Decision

يأتي organizationId من session الخادمية فقط. يضبط `Database.withTenant()` متغير PostgreSQL `app.organization_id` داخل كل transaction، وتفرض RLS policy هذا المتغير على كل جدول مملوك لمستأجر مع `FORCE ROW LEVEL SECURITY`. يعمل التطبيق بحساب `dentpilot_app` مستقل يحمل `NOSUPERUSER NOBYPASSRLS`؛ ويستخدم migration/seed حسابًا منفصلًا لا يصل إلى runtime. تضيف AuthorizationService scope checks فوق ذلك.

## Consequences

لا تستطيع controller الثقة بمعرّف tenant من العميل، ويجب تشغيل كل query مملوك للمؤسسة ضمن transaction مُسقطة النطاق. تظل اختبارات cross-tenant وIDOR بوابة قبول لازمة.
