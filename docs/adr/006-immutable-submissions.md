# ADR 006 — Immutable Submission Snapshots

## Context

التعريفات والسياسات والتكليفات تتغير بمرور الترم، لكن الإرسال والتقييم التاريخي يجب أن يظلا مفهومين وغير قابلين للتحوير.

## Decision

عند submission تنشئ transaction صف `submission_snapshots` يحفظ payload وسياق الطالب والتسجيل والقسم والسنة والمستوى والمجموعة والتكليف وإصدارات workflow/requirements/template/grading. يمنع trigger في PostgreSQL UPDATE وDELETE على snapshots. ينشئ resubmission صفًا جديدًا مرتبطًا بالسابق.

## Consequences

لا يوجد PATCH عام للـsnapshot. تظل `case_sheets.current_status` projection قابلة للتحديث منفصلة، لكن الحقيقة المرسلة والتاريخية append-only ومختبرة مباشرة على DB.
