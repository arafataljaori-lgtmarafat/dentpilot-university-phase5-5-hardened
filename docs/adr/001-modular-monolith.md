# ADR 001 — Modular Monolith for Phase 1

## Context

DentPilot يحتاج حدودًا صريحة للهوية، النطاق، الأكاديميا، الكاسشيتات، النتائج، التدقيق والملفات، لكنه لا يملك في Phase 1 دليلًا يبرر معاملات موزعة أو نشرًا مستقلاً لكل حد.

## Decision

نستخدم تطبيق Fastify واحدًا مع packages مستقلة وعقود API وموديولات خادمية ذات repositories/services مخصصة. لا يسمح module بمعالجة جدول module آخر مباشرة؛ تستدعى خدمة الحد المالكة ضمن transaction.

## Consequences

تظل المعاملات الذرية والتصحيح المحلي بسيطين، وتبقى الحدود قابلة للاستخراج لاحقًا. لا تُدخل microservices أو Kafka أو event sourcing أو Kubernetes في هذا الإصدار.
