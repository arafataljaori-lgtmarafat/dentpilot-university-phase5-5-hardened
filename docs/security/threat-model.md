# Threat Model

| التهديد | سيناريو الهجوم | الضوابط | اختبار Phase 1 |
| --- | --- | --- | --- |
| IDOR / BOLA | تعديل UUID أو case/file ID في URL. | RLS tenant + query scope + AuthorizationService. | actor خارج scope يحصل 403/404 ولا يوجد body حساس. |
| Tenant escape | session من Institution A يمرر ID لـB أو tenantId مزيف. | tenant من session فقط وRLS transaction-local. | قراءة/تحديث/report/export لـB مرفوضة. |
| تصعيد عمودي | Department Admin أو Supervisor يستدعي أمرًا إداريًا. | role permission matrix وأوامر صريحة. | كل أمر حساس يرفض الدور غير المخول. |
| تصعيد أفقي للمشرف | supervisor يرى/يراجع/يقيّم حالة لا يملك assignment فعالاً لها. | department scope + active assignment + reviewCases/grade. | assignment غير مطابق أو permission=false يرفض. |
| تعطيل الحساب | session قائمة تستمر بعد Disabled. | check account status في كل authenticate. | request لاحق يرفض 403. |
| Session theft/fixation | إعادة استخدام token أو ثبات session عبر login. | random tokens hashed، expiry، revocation، rotation boundary. | logout token مرفوض؛ raw tokens لا تظهر في DB/logs. |
| CSRF | موقع خارجي ينفذ mutation cookie-authenticated. | SameSite + CSRF cookie/header/server hash check. | mutation بلا/بـCSRF خاطئ يرفض 403. |
| brute force | محاولات login متكررة. | Fastify rate limit لكل endpoint login. | تخطي الحد ينتج 429. |
| mass assignment | client يرسل role/tenant/status داخل body. | Zod allowlists وserver-derived principal/context. | الحقول الزائدة لا تؤثر ولا تمنح access. |
| snapshot tampering | تعديل أو حذف submission تاريخي. | DB trigger append-only + لا PATCH route. | SQL UPDATE/DELETE يفشل. |
| audit tampering | حذف أو تعديل أثر التدقيق. | DB trigger append-only وصلاحية application محدودة. | SQL UPDATE/DELETE يفشل. |
| grade tampering | تعديل درجة بلا سبب أو بعد term lock. | grade event history، reason، state/authorization. | amendment بلا reason أو صلاحية يرفض. |
| invitation theft/reuse | token مسرب أو مستخدم مرتين/بعد expiry. | random token hashed، single-use، expiry، revocation. | token مستعمل/منتهي يرفض. |
| attachment leak | رابط دائم أو object key تحكمه الواجهة. | private bucket، server key، pre-signed URL بعد authorization. | file خارج scope لا ينشئ read URL. |
| patient information leakage | PII في object key/log/export/report. | key random، safe logging، aggregate DTO، export sanitation. | report serialized لا يحمل student fields وCSV cells تُحيد. |
| XSS | payload حر يعاد في UI. | validation وحدود عقود، React escaping، CSP. | contract لا يعكس HTML كتعليمات. |

التهديدات عالية القيمة تدخل اختبارات التكامل الفعلية بقاعدة PostgreSQL. لا يُعد اختبار mock-only دليلاً كافيًا لسلامة قاعدة البيانات أو RLS أو triggers.
