# ADR 004 — Authentication and Session Strategy

## Context

دخول v7 التجريبي لا يصلح كحد مصادقة. المطلوب جلسة مؤسسية قابلة للإلغاء ومقاومة للتثبيت والتخمين والطلبات العابرة للمواقع.

## Decision

تحفظ كلمات المرور بـArgon2id فقط. تنشئ الخدمة رموز session وCSRF عبر `crypto.randomBytes` وتحفظ hashes فقط. تحمل cookie HttpOnly + Secure في الإنتاج + SameSite=Strict، ويُطلب CSRF header مطابق لكل mutation. للجلسة expiry وإلغاء وتدقيق دخول/فشل/خروج، وللدعوات token hashed أحادي الاستعمال منتهي وقابل للإبطال.

## Consequences

لا يوجد password أو session token قابل للعكس في قاعدة البيانات أو السجل. تظل واجهة reset وOIDC/SSO deferred، لكن طبقة identity لا تمنع إضافتهما لاحقًا.
