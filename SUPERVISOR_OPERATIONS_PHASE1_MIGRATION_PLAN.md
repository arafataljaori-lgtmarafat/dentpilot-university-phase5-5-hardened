# Supervisor Operations Implementation Sprint - Phase 1 Migration Plan

## Objective
Implement the first phase of the Supervisor Operations bounded module. This phase focuses solely on the database foundation, adding required tables and constraints without modifying any existing UI, API, or logic.

## 1. Supervisor Permission Model

### `supervisor_permission_set_versions`
Represents a published version of supervisor permissions.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `version_number` INTEGER NOT NULL
- `status` version_status NOT NULL DEFAULT 'DRAFT'
- `effective_at` TIMESTAMPTZ
- `published_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
*Constraint: `reject_published_version_mutation()` trigger to ensure published versions are immutable.*

### `supervisor_permission_set_items`
The specific allowed permissions for a set version.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `version_id` UUID NOT NULL REFERENCES supervisor_permission_set_versions(id)
- `permission` TEXT NOT NULL
*Constraint: `CHECK(permission IN ('START_APPROVAL', 'COMPLETION_APPROVAL', 'CASESHEET_EVALUATION', 'CLINICAL_FEEDBACK'))` to prevent invalid permissions.*

### `supervisor_permission_grants`
Links a supervisor assignment to a published permission set for a period.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `assignment_id` UUID NOT NULL REFERENCES supervisor_assignments(id)
- `permission_set_version_id` UUID NOT NULL REFERENCES supervisor_permission_set_versions(id)
- `effective_from` TIMESTAMPTZ NOT NULL
- `effective_to` TIMESTAMPTZ
*Constraint: Duplicate active grants prevented via partial unique index. Check `effective_to > effective_from`.*

## 2. Clinical Duty Scheduling Model

### `clinical_duty_schedules`
Represents the supervisor schedule.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `department_id` UUID NOT NULL REFERENCES departments(id)
- `academic_year_id` UUID NOT NULL REFERENCES academic_years(id)
- `term_id` UUID REFERENCES terms(id)
- `academic_level_id` UUID REFERENCES academic_levels(id)
- `cohort_id` UUID REFERENCES cohorts(id)
- `group_id` UUID REFERENCES academic_groups(id)
- `timezone` TEXT NOT NULL
- `valid_from` TIMESTAMPTZ NOT NULL
- `valid_to` TIMESTAMPTZ NOT NULL
- `status` lifecycle_status NOT NULL DEFAULT 'ACTIVE'

### `clinical_duty_shifts`
Represents the actual shifts.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `schedule_id` UUID NOT NULL REFERENCES clinical_duty_schedules(id)
- `starts_at` TIMESTAMPTZ NOT NULL
- `ends_at` TIMESTAMPTZ NOT NULL
- `status` lifecycle_status NOT NULL DEFAULT 'ACTIVE'
- `revision` INTEGER NOT NULL DEFAULT 1
*Constraints:* 
- *`CHECK(ends_at > starts_at)`*
- *Custom trigger to prevent modifying date/time after the shift starts (`now() >= starts_at`).*

### `clinical_duty_members`
Links a shift, a supervisor assignment, and a permission grant.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `shift_id` UUID NOT NULL REFERENCES clinical_duty_shifts(id)
- `assignment_id` UUID NOT NULL REFERENCES supervisor_assignments(id)
- `grant_id` UUID NOT NULL REFERENCES supervisor_permission_grants(id)
*Constraint: Validate that assignment and grant are valid for the shift.*

## 3. Case Duty Evidence

### `clinical_case_duty_links`
Links a case sheet to a shift.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `case_sheet_id` UUID NOT NULL REFERENCES case_sheets(id)
- `shift_id` UUID NOT NULL REFERENCES clinical_duty_shifts(id)
*(No `owner_supervisor_id` as cases are not permanently owned by a supervisor)*

## 4. Clinical Casesheet Evaluation Storage

### `clinical_evaluation_events`
Stores the evaluation score for a case sheet.
- `id` UUID PRIMARY KEY
- `organization_id` UUID NOT NULL REFERENCES organizations(id)
- `snapshot_id` UUID NOT NULL REFERENCES submission_snapshots(id)
- `evaluator_account_id` UUID NOT NULL REFERENCES accounts(id)
- `duty_member_id` UUID NOT NULL REFERENCES clinical_duty_members(id)
- `permission_set_version_id` UUID NOT NULL REFERENCES supervisor_permission_set_versions(id)
- `score` NUMERIC(4,2) NOT NULL
- `comment` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
*Constraints:*
- *`CHECK(score >= 0 AND score <= 10)`*
- *Trigger `reject_immutable_mutation()` to ensure append-only.*

## Database Safety Requirements
1. **Row Level Security (RLS)**: Enable and `FORCE ROW LEVEL SECURITY` on all new tables with `tenant_isolation` policy.
2. **Foreign Keys**: All relations will have `organization_id` included and proper references.
3. **Roles**: Ensure `dentpilot_app` retains its non-superuser status.
4. No data deletion or modification in existing tables.
