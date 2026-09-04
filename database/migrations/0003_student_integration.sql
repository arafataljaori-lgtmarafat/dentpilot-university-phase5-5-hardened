-- Student App integration (Phase 2D):
--   1. Let an invitation carry the student it is meant to provision, so account
--      creation can link accounts.student_id safely instead of leaving it unset.
--   2. Guarantee at most one account is ever linked to a given student.
--   3. Add lookup indexes for the new student-scoped draft/submission read paths.
-- No existing table is redefined, no existing column is dropped or retyped, and
-- FORCE ROW LEVEL SECURITY already applied in 0001_initial.sql covers the new
-- column automatically (policy is keyed on organization_id, not on column list).

ALTER TABLE invitations ADD COLUMN student_id uuid REFERENCES students(id);

-- A STUDENT_INTEGRATION invitation must always carry the student it provisions;
-- every other role must never carry one. This mirrors the existing role_code
-- check style already used elsewhere in the schema (e.g. clinical_decisions.decision_type).
ALTER TABLE invitations ADD CONSTRAINT invitations_student_role_chk
  CHECK ((role = 'STUDENT_INTEGRATION') = (student_id IS NOT NULL));

-- Prevents a second account from ever being linked to a student already
-- provisioned (defense in depth alongside the redemption-time application check).
CREATE UNIQUE INDEX accounts_student_id_unique ON accounts (student_id) WHERE student_id IS NOT NULL;

CREATE INDEX student_drafts_student_lookup ON student_drafts (organization_id, student_id, updated_at DESC);
CREATE INDEX submission_snapshots_student_history ON submission_snapshots (organization_id, student_id, submitted_at DESC);
