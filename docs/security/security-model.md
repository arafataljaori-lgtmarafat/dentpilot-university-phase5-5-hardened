# Security Model

## حدود الثقة

المتصفح عميل غير موثوق؛ لا يملك بيانات المؤسسة أو الدور أو tenant أو scope سلطة قرار. تقع الحقيقة في PostgreSQL، وتأتي هوية المستأجر من session cookie التي يتحقق منها الخادم. تفرض كل transaction RLS عبر `app.organization_id` وتضيف AuthorizationService قواعد role/department/academic-year/level/cohort/group/effective-assignment/state.

| الطبقة | الضوابط المنفذة |
| --- | --- |
| الهوية | Argon2id، session tokens عشوائية hashed، cookies HttpOnly/Secure في الإنتاج، expiry، logout/revocation، login rate-limit. |
| الطلبات | Zod validation، 1MB body limit، CSRF لكل mutation cookie-authenticated، error envelope لا يعرض stack. |
| HTTP | CORS allowlist وحيد من config، Helmet/CSP، `frame-ancestors 'none'`. |
| التفويض | نقطة خادمية موحدة؛ tenant/account status/role/department/student ownership/assignment permissions/record state. |
| البيانات | PostgreSQL FK/check/partial indexes، transactions، forced RLS، runtime role بـ`NOSUPERUSER NOBYPASSRLS`، optimistic revision، idempotency keys. |
| التاريخ | snapshots/audit/grade history triggers تمنع UPDATE/DELETE. |
| الملفات | MinIO private، مفاتيح يولدها الخادم، URLs موقعة لخمس دقائق، content-type/size/checksum metadata. |
| التشغيل | JSON logging آمن، request IDs، health/live وhealth/ready، أسرار عبر env فقط، dependency audit command. |

## سياسة الأسرار والخصوصية

لا تسجل كلمات مرور أو cookies أو authorization headers أو invitation/session tokens أو private clinical narrative أو file contents. لا يضم object key اسمًا أو رقمًا سريريًا. يتطلب أي export تفويضًا خادميًا ومعالجة CSV formula injection. بيانات التطوير الحتمية في seed ليست بيانات كلية أو مرضى حقيقية وتستخدم credentials موثقة للتطوير فقط.

## أدوار PostgreSQL

`dentpilot_owner` مخصص لتهيئة البيئة وإدارة الملكية، و`dentpilot_migrator` يطبق schema/seed كخطوة release مستقلة، و`dentpilot_app` هو الحساب الوحيد المستخدم وقت التشغيل. يمنع migration البدء إذا كان حساب التطبيق `SUPERUSER` أو يملك `BYPASSRLS`، ولا يملك التطبيق جدول `schema_migrations`.
