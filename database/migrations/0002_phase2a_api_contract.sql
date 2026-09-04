CREATE TYPE file_object_status AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'LINKED');

ALTER TABLE file_objects
  ADD COLUMN status file_object_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  ADD COLUMN completed_at timestamptz;

UPDATE file_objects AS file
SET status = 'LINKED', completed_at = file.created_at
FROM attachments AS attachment
WHERE attachment.file_object_id = file.id;

ALTER TABLE file_objects
  ADD CONSTRAINT file_objects_completion_state_check CHECK (
    (status = 'PENDING_UPLOAD' AND completed_at IS NULL)
    OR (status IN ('UPLOADED', 'LINKED') AND completed_at IS NOT NULL)
  );

CREATE UNIQUE INDEX attachments_one_target_per_file ON attachments (organization_id, file_object_id);
CREATE INDEX students_name_lookup ON students (organization_id, lower(display_name), id);
CREATE INDEX academic_enrollments_student_history ON academic_enrollments (organization_id, student_id, started_at DESC);
CREATE INDEX supervisor_assignments_portal_list ON supervisor_assignments (organization_id, department_id, academic_year_id, academic_level_id, status, effective_from DESC);
CREATE INDEX submission_snapshots_portal_list ON submission_snapshots (organization_id, academic_year_id, department_id, submitted_at DESC, id);
