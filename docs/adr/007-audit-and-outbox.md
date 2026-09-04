# ADR 007 — Append-Only Audit and Transactional Outbox

## Context

الأحداث العميلية يمكن تعديلها أو حذفها، بينما قرارات الأكاديميا والأمن تحتاج أثرًا موثوقًا مع actor وscope وcorrelation.

## Decision

ينشئ كل mutation مهم `audit_events` في المعاملة نفسها حيث يكون ذلك ممكنًا. يمنع trigger قاعدة البيانات UPDATE وDELETE على audit/grade history. يستخدم `outbox_events` لتسجيل نوايا التكامل المستقبلية transactionally، من دون queue أو worker إضافي في Phase 1.

## Consequences

يظل السجل قابلاً للتحقيق ولا يسجل أسرارًا أو raw payload حساسًا. لا تدعي Phase 1 وجود consumer أو external integration؛ outbox هو حد مهيأ ومُوثق فقط.
