# State Machines

## العمليات الأساسية

| Aggregate | الحالات | الانتقالات المسموح بها | حارس الانتقال |
| --- | --- | --- | --- |
| Account | Pending, Active, Disabled | Pending→Active، Active→Disabled | سلطة مؤسسية، وتُرفض الجلسة عند Disabled. |
| Invitation | Active, Used, Revoked, Expired | Active→Used/Revoked/Expired | token hash، expiry، single-use وtransaction lock. |
| Enrollment | Active, Closed | Active→Closed | يقفل memberships/groups التابعة في المعاملة نفسها مع سبب. |
| Roster Membership | Active, Closed, Removed | Active→Closed/Removed | enrollment متوافق وactive عند الإنشاء. |
| Group Membership | Active, Removed, Closed | Active→Removed/Closed ثم Active جديد عند النقل | Groups Enabled فقط، واحدة فعالة لكل enrollment/department. |
| Supervisor Assignment | Active, Closed, Archived | Active→Closed | authority وسبب، ولا تعيد كتابة التاريخ. |
| Requirement Version | Draft, Published, Archived | Draft→Published→Archived | Published immutable وpublish ضمن scope. |
| Submission | Draft, Submitted, Revision Requested, Approved Start, Approved Final, Graded | Draft→Submitted→Revision/Start→Final→Graded؛ Revision→Submitted جديد | `case_sheets.current_status` هو المصدر الوحيد للحالة الحالية؛ snapshots immutable؛ كل قرار يمر عبر نفس domain transition guard. |
| Grade | Recorded, Amended | Recorded→Amended | actor مخول وسبب إلزامي، event سابق محفوظ. |
| Term Result Closure | Draft, Reviewed, Approved, Locked, Reopened | Draft→Reviewed→Approved→Locked→Reopened→Reviewed | lock يمنع التعديل وreopen يتطلب سببًا وتدقيقًا. |

لا يسمح API بـgeneric PATCH لتجاوز هذه المسارات. تمثل الأوامر endpoints صريحة مثل submit/revision/grade/lock/reopen، وتختبر الحزمة الانتقالات غير القانونية بوصفها أخطاء `ILLEGAL_TRANSITION` أو `CONFLICT`.

## قفل الفصل

تظل `submission_snapshots` تاريخًا غير قابل للتعديل ولا تحمل نسخة ثانية من الحالة الحالية. عند وصول `term_result_closures` إلى `LOCKED` تمنع الخدمة وقاعدة البيانات معًا approval/revision/grade/amendment وتغيير حالة case sheet المطابق. لا يُستأنف التعديل إلا بعد انتقال إغلاق الفصل إلى `REOPENED` بسبب مدقق.
