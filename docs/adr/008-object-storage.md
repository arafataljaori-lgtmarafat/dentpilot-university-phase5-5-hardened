# ADR 008 — Private S3-Compatible Object Storage

## Context

لا تصلح ملفات تطبيق الويب أو browser-local state كمخزن لمرفقات سريرية أو أكاديمية، ولا تناسب الروابط العامة الدائمة بيئة كلية.

## Decision

يستخدم Production Core abstraction متوافقة مع S3، وMinIO محليًا. المخزن خاص، والمفتاح يولده الخادم من tenant UUID ومعرف عشوائي ولا يضم اسم مريض أو اسم ملف. روابط upload/read موقعة لخمس دقائق فقط بعد authorization، مع metadata للـcontent type والحجم وSHA-256 والمالك.

## Consequences

يجب التحقق من attachment ownership قبل read، ويبقى فحص malware نقطة تكامل موثقة ومؤجلة. لا يتيح النظام public bucket أو public URL أو browser-generated key.
