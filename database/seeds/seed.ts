import argon2 from 'argon2';
import pg from 'pg';

const ids = {
  org: '11111111-1111-4111-8111-111111111111', college: '11111111-1111-4111-8111-111111111112', op: '11111111-1111-4111-8111-111111111113', oral: '11111111-1111-4111-8111-111111111114', year: '11111111-1111-4111-8111-111111111115', term: '11111111-1111-4111-8111-111111111116', l5: '11111111-1111-4111-8111-111111111117', cohort: '11111111-1111-4111-8111-111111111118', admin: '11111111-1111-4111-8111-111111111119', deptAdmin: '11111111-1111-4111-8111-111111111120', supervisor: '11111111-1111-4111-8111-111111111121', disabled: '11111111-1111-4111-8111-111111111122', studentAccount: '11111111-1111-4111-8111-111111111123', student: '11111111-1111-4111-8111-111111111124', enrollment: '11111111-1111-4111-8111-111111111125', roster: '11111111-1111-4111-8111-111111111126', group: '11111111-1111-4111-8111-111111111127', assignment: '11111111-1111-4111-8111-111111111128', reqSet: '11111111-1111-4111-8111-111111111129', reqVersion: '11111111-1111-4111-8111-111111111130', requirement: '11111111-1111-4111-8111-111111111131', workflow: '11111111-1111-4111-8111-111111111132', template: '11111111-1111-4111-8111-111111111133', grading: '11111111-1111-4111-8111-111111111134', draft: '11111111-1111-4111-8111-111111111135', caseSheet: '11111111-1111-4111-8111-111111111136', snapshot: '11111111-1111-4111-8111-111111111137', closure: '11111111-1111-4111-8111-111111111138',
  facultyProfile: '11111111-1111-4111-8111-111111111139',
  permSetVersion: '11111111-1111-4111-8111-111111111140',
  permGrant: '11111111-1111-4111-8111-111111111141',
  schedule: '11111111-1111-4111-8111-111111111142',
  shift: '11111111-1111-4111-8111-111111111143',
  dutyMember: '11111111-1111-4111-8111-111111111144',
};
const databaseUrl = process.env.SEED_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error('SEED_DATABASE_URL or MIGRATION_DATABASE_URL is required.');
const client = new pg.Client({ connectionString: databaseUrl });

async function main(): Promise<void> {
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ids.org]);
    const existing = await client.query('SELECT 1 FROM organizations WHERE id=$1', [ids.org]);
    if (existing.rowCount) { await client.query('ROLLBACK'); console.log('Deterministic seed already present.'); return; }
    const password = await argon2.hash('development-only-password', { type: argon2.argon2id });
    await client.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$3)', [ids.org, 'جامعة تجريبية للتطوير', 'dev-dental-university']);
    await client.query('INSERT INTO colleges(id,organization_id,name) VALUES($1,$2,$3)', [ids.college, ids.org, 'كلية طب الأسنان']);
    await client.query('INSERT INTO departments(id,organization_id,college_id,code,name) VALUES($1,$2,$3,$4,$5),($6,$2,$3,$7,$8)', [ids.op, ids.org, ids.college, 'OP', 'Operative Dentistry', ids.oral, 'OR', 'Oral Medicine']);
    await client.query('INSERT INTO academic_years(id,organization_id,label,starts_on,ends_on) VALUES($1,$2,$3,$4,$5)', [ids.year, ids.org, '2025–2026', '2025-09-01', '2026-08-31']);
    await client.query('INSERT INTO terms(id,organization_id,academic_year_id,label,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)', [ids.term, ids.org, ids.year, 'الفصل الأول', '2025-09-01', '2026-01-31']);
    await client.query('INSERT INTO academic_levels(id,organization_id,code,label,ordinal) VALUES($1,$2,$3,$4,$5)', [ids.l5, ids.org, 'L5', 'المستوى الخامس', 5]);
    await client.query('INSERT INTO cohorts(id,organization_id,label) VALUES($1,$2,$3)', [ids.cohort, ids.org, '2024']);
    await client.query('INSERT INTO accounts(id,organization_id,college_id,email,password_hash,status,primary_role) VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$3,$9,$5,$10,$11),($12,$2,$3,$13,$5,$10,$14),($15,$2,$3,$16,$5,$17,$18),($19,$2,$3,$20,$5,$10,$21)', [ids.admin,ids.org,ids.college,'admin@dev.dentpilot.local',password,'ACTIVE','UNIVERSITY_ADMIN',ids.deptAdmin,'dept.admin@dev.dentpilot.local','ACTIVE','DEPARTMENT_ADMIN',ids.supervisor,'supervisor@dev.dentpilot.local','CLINICAL_SUPERVISOR',ids.disabled,'disabled@dev.dentpilot.local','DISABLED','CLINICAL_SUPERVISOR',ids.studentAccount,'student@dev.dentpilot.local','STUDENT_INTEGRATION']);
    await client.query('INSERT INTO account_scopes(organization_id,account_id,department_id,academic_year_id,academic_level_id,cohort_id) VALUES($1,$2,$3,$4,$5,$6),($1,$7,$3,$4,$5,$6),($1,$8,$3,$4,$5,$6),($1,$9,$3,$4,$5,$6)', [ids.org,ids.deptAdmin,ids.op,ids.year,ids.l5,ids.cohort,ids.supervisor,ids.disabled,ids.studentAccount]);
    await client.query('INSERT INTO students(id,organization_id,college_id,student_number,display_name) VALUES($1,$2,$3,$4,$5)', [ids.student,ids.org,ids.college,'D-DEV-001','طالب تجريبي']);
    await client.query('UPDATE accounts SET student_id=$1 WHERE id=$2', [ids.student,ids.studentAccount]);
    await client.query('INSERT INTO academic_enrollments(id,organization_id,student_id,academic_year_id,academic_level_id,cohort_id) VALUES($1,$2,$3,$4,$5,$6)', [ids.enrollment,ids.org,ids.student,ids.year,ids.l5,ids.cohort]);
    await client.query('INSERT INTO rosters(id,organization_id,department_id,academic_year_id,academic_level_id,cohort_id) VALUES($1,$2,$3,$4,$5,$6)', [ids.roster,ids.org,ids.op,ids.year,ids.l5,ids.cohort]);
    await client.query('INSERT INTO roster_memberships(organization_id,roster_id,student_id,enrollment_id) VALUES($1,$2,$3,$4)', [ids.org,ids.roster,ids.student,ids.enrollment]);
    await client.query('INSERT INTO department_distribution_policies(organization_id,department_id,academic_year_id,academic_level_id,mode) VALUES($1,$2,$3,$4,$5),($1,$6,$3,$4,$7)', [ids.org,ids.op,ids.year,ids.l5,'GROUPS_ENABLED',ids.oral,'FULL_COHORT']);
    await client.query('INSERT INTO academic_groups(id,organization_id,department_id,academic_year_id,academic_level_id,name,range_start,range_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [ids.group,ids.org,ids.op,ids.year,ids.l5,'Group A',1,20]);
    await client.query('INSERT INTO group_memberships(organization_id,group_id,department_id,student_id,enrollment_id) VALUES($1,$2,$3,$4,$5)', [ids.org,ids.group,ids.op,ids.student,ids.enrollment]);
    await client.query('INSERT INTO supervisor_assignments(id,organization_id,supervisor_account_id,department_id,academic_year_id,academic_level_id,cohort_id,group_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [ids.assignment,ids.org,ids.supervisor,ids.op,ids.year,ids.l5,ids.cohort,ids.group,'Development assignment']);
    await client.query("INSERT INTO supervisor_assignment_permissions(organization_id,assignment_id,permission,granted) VALUES($1,$2,'reviewCases',true),($1,$2,'grade',true)", [ids.org,ids.assignment]);
    await client.query("INSERT INTO requirement_sets(id,organization_id,department_id,academic_year_id,academic_level_id,title,status) VALUES($1,$2,$3,$4,$5,$6,'PUBLISHED')", [ids.reqSet,ids.org,ids.op,ids.year,ids.l5,'OP Core']);
    await client.query("INSERT INTO requirement_set_versions(id,organization_id,requirement_set_id,version_number,status,effective_at,published_at) VALUES($1,$2,$3,1,'PUBLISHED',now(),now())", [ids.reqVersion,ids.org,ids.reqSet]);
    await client.query('INSERT INTO requirements(id,organization_id,requirement_set_version_id,code,label,required_count) VALUES($1,$2,$3,$4,$5,$6)', [ids.requirement,ids.org,ids.reqVersion,'OP-REST','Operative Restoration',3]);
    await client.query("INSERT INTO grading_policy_versions(id,organization_id,department_id,version_number,status,definition,published_at) VALUES($1,$2,$3,1,'PUBLISHED','{\"maxGrade\":100}',now())", [ids.grading,ids.org,ids.op]);
    await client.query("INSERT INTO case_sheet_template_versions(id,organization_id,department_id,version_number,status,definition,published_at) VALUES($1,$2,$3,1,'PUBLISHED','{\"fields\":[\"procedure\"]}',now())", [ids.template,ids.org,ids.op]);
    await client.query("INSERT INTO clinical_workflow_policy_versions(id,organization_id,department_id,version_number,status,definition,published_at) VALUES($1,$2,$3,1,'PUBLISHED','{\"studentGradeVisible\":false}',now())", [ids.workflow,ids.org,ids.op]);
    await client.query('INSERT INTO student_drafts(id,organization_id,student_id,enrollment_id,term_id,template_version_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7)', [ids.draft,ids.org,ids.student,ids.enrollment,ids.term,ids.template,{procedure:'private draft'}]);
    await client.query('INSERT INTO case_sheets(id,organization_id,student_id,enrollment_id,department_id,term_id,current_status) VALUES($1,$2,$3,$4,$5,$6,$7)', [ids.caseSheet,ids.org,ids.student,ids.enrollment,ids.op,ids.term,'SUBMITTED']);
    await client.query('INSERT INTO submission_snapshots(id,organization_id,case_sheet_id,student_id,enrollment_id,department_id,term_id,academic_year_id,academic_level_id,cohort_id,group_id,supervisor_assignment_id,workflow_policy_version_id,requirement_set_version_id,requirement_id,template_version_id,grading_policy_version_id,payload,sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1)', [ids.snapshot,ids.org,ids.caseSheet,ids.student,ids.enrollment,ids.op,ids.term,ids.year,ids.l5,ids.cohort,ids.group,ids.assignment,ids.workflow,ids.reqVersion,ids.requirement,ids.template,ids.grading,{procedure:'submitted case'}]);
    await client.query('UPDATE case_sheets SET latest_snapshot_id=$1 WHERE id=$2', [ids.snapshot,ids.caseSheet]);
    await client.query('INSERT INTO term_result_closures(id,organization_id,department_id,term_id,academic_level_id,cohort_id) VALUES($1,$2,$3,$4,$5,$6)', [ids.closure,ids.org,ids.op,ids.term,ids.l5,ids.cohort]);

    await client.query(
      'INSERT INTO faculty_profiles(id,organization_id,account_id,employee_number,display_name,active) VALUES($1,$2,$3,$4,$5,$6)',
      [ids.facultyProfile, ids.org, ids.supervisor, 'EMP-DEV-001', 'مشرف تجريبي', true]
    );

    await client.query(
      "INSERT INTO supervisor_permission_set_versions(id,organization_id,version_number,status,effective_at,published_at) VALUES($1,$2,1,'PUBLISHED',now(),now())",
      [ids.permSetVersion, ids.org]
    );
    await client.query(
      "INSERT INTO supervisor_permission_set_items(organization_id,version_id,permission) VALUES($1,$2,'START_APPROVAL'),($1,$2,'COMPLETION_APPROVAL'),($1,$2,'CASESHEET_EVALUATION'),($1,$2,'CLINICAL_FEEDBACK')",
      [ids.org, ids.permSetVersion]
    );

    await client.query(
      'INSERT INTO supervisor_permission_grants(id,organization_id,assignment_id,permission_set_version_id,effective_from) VALUES($1,$2,$3,$4,now() - interval \'1 hour\')',
      [ids.permGrant, ids.org, ids.assignment, ids.permSetVersion]
    );

    await client.query(
      'INSERT INTO clinical_duty_schedules(id,organization_id,department_id,academic_year_id,timezone,valid_from,valid_to) VALUES($1,$2,$3,$4,\'Asia/Riyadh\',now() - interval \'1 month\',now() + interval \'1 month\')',
      [ids.schedule, ids.org, ids.op, ids.year]
    );

    await client.query(
      'INSERT INTO clinical_duty_shifts(id,organization_id,schedule_id,starts_at,ends_at) VALUES($1,$2,$3,now() - interval \'1 hour\',now() + interval \'8 hours\')',
      [ids.shift, ids.org, ids.schedule]
    );

    await client.query(
      'INSERT INTO clinical_duty_members(id,organization_id,shift_id,assignment_id,grant_id) VALUES($1,$2,$3,$4,$5)',
      [ids.dutyMember, ids.org, ids.shift, ids.assignment, ids.permGrant]
    );

    await client.query('INSERT INTO audit_events(organization_id,actor_account_id,actor_role,action,entity_type,entity_id,department_id,correlation_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,gen_random_uuid(),$8)', [ids.org,ids.admin,'UNIVERSITY_ADMIN','SEED_COMPLETED','organization',ids.org,ids.op,{environment:'development'}]);
    await client.query('COMMIT'); console.log('Deterministic development seed applied.');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
