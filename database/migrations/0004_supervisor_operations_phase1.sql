CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE supervisor_permission_set_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    version_number integer NOT NULL,
    status version_status NOT NULL DEFAULT 'DRAFT',
    effective_at timestamptz,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, version_number)
);

CREATE TABLE supervisor_permission_set_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    version_id uuid NOT NULL REFERENCES supervisor_permission_set_versions(id),
    permission text NOT NULL CHECK (permission IN ('START_APPROVAL', 'COMPLETION_APPROVAL', 'CASESHEET_EVALUATION', 'CLINICAL_FEEDBACK')),
    UNIQUE (organization_id, version_id, permission)
);

CREATE TABLE supervisor_permission_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    assignment_id uuid NOT NULL REFERENCES supervisor_assignments(id),
    permission_set_version_id uuid NOT NULL REFERENCES supervisor_permission_set_versions(id),
    effective_from timestamptz NOT NULL,
    effective_to timestamptz,
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT no_overlapping_active_grants EXCLUDE USING gist (
        organization_id WITH =,
        assignment_id WITH =,
        tstzrange(effective_from, effective_to) WITH &&
    )
);

CREATE TABLE clinical_duty_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    department_id uuid NOT NULL REFERENCES departments(id),
    academic_year_id uuid NOT NULL REFERENCES academic_years(id),
    term_id uuid REFERENCES terms(id),
    academic_level_id uuid REFERENCES academic_levels(id),
    cohort_id uuid REFERENCES cohorts(id),
    group_id uuid REFERENCES academic_groups(id),
    timezone text NOT NULL,
    valid_from timestamptz NOT NULL,
    valid_to timestamptz NOT NULL,
    status lifecycle_status NOT NULL DEFAULT 'ACTIVE',
    CHECK (valid_to > valid_from)
);

CREATE TABLE clinical_duty_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    schedule_id uuid NOT NULL REFERENCES clinical_duty_schedules(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status lifecycle_status NOT NULL DEFAULT 'ACTIVE',
    revision integer NOT NULL DEFAULT 1,
    CHECK (ends_at > starts_at)
);

CREATE TABLE clinical_duty_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    shift_id uuid NOT NULL REFERENCES clinical_duty_shifts(id),
    assignment_id uuid NOT NULL REFERENCES supervisor_assignments(id),
    grant_id uuid NOT NULL REFERENCES supervisor_permission_grants(id),
    UNIQUE (organization_id, shift_id, assignment_id)
);

CREATE TABLE clinical_case_duty_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    case_sheet_id uuid NOT NULL REFERENCES case_sheets(id),
    shift_id uuid NOT NULL REFERENCES clinical_duty_shifts(id),
    UNIQUE (organization_id, case_sheet_id)
);

CREATE TABLE clinical_evaluation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    snapshot_id uuid NOT NULL REFERENCES submission_snapshots(id),
    evaluator_account_id uuid NOT NULL REFERENCES accounts(id),
    duty_member_id uuid NOT NULL REFERENCES clinical_duty_members(id),
    permission_set_version_id uuid NOT NULL REFERENCES supervisor_permission_set_versions(id),
    score numeric(4,2) NOT NULL CHECK(score >= 0 AND score <= 10),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Triggers for safety constraints
CREATE OR REPLACE FUNCTION reject_started_shift_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.starts_at <= now() THEN
    IF OLD.starts_at IS DISTINCT FROM NEW.starts_at OR OLD.ends_at IS DISTINCT FROM NEW.ends_at THEN
        RAISE EXCEPTION 'cannot modify shift time after it has started';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinical_duty_shifts_started_guard BEFORE UPDATE ON clinical_duty_shifts FOR EACH ROW EXECUTE FUNCTION reject_started_shift_mutation();

CREATE TRIGGER supervisor_permission_set_versions_published_immutable BEFORE UPDATE OR DELETE ON supervisor_permission_set_versions FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER clinical_evaluation_events_append_only BEFORE UPDATE OR DELETE ON clinical_evaluation_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

-- RLS Setup
DO $$ 
DECLARE 
  tbl text; 
BEGIN 
  FOR tbl IN SELECT unnest(ARRAY[
    'supervisor_permission_set_versions',
    'supervisor_permission_set_items',
    'supervisor_permission_grants',
    'clinical_duty_schedules',
    'clinical_duty_shifts',
    'clinical_duty_members',
    'clinical_case_duty_links',
    'clinical_evaluation_events'
  ]) LOOP 
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl); 
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl); 
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = current_setting(''app.organization_id'', true)::uuid) WITH CHECK (organization_id = current_setting(''app.organization_id'', true)::uuid)', tbl); 
  END LOOP; 
END $$;
