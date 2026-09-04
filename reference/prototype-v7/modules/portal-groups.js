(function(){
  window.PortalModules ||= {};
  window.PortalModules.groups = true;

  const DATA = window.PortalData;
  const actor = { id: 'uni-01', name: 'د. رامي اسحاق', role: 'University Admin' };
  const now = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const active = (item) => item?.status === 'Active';
  const levelCode = (level) => level === 'المستوى الخامس' ? 'l5' : level === 'المستوى الرابع' ? 'l4' : level === 'المستوى الثالث' ? 'l3' : String(level || 'level').replace(/\W+/g, '').toLowerCase();
  const yearCode = (academicYear) => String(academicYear || '').replace(/[^0-9a-z]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const groupKey = (academicYear, departmentId, level, name) => `${academicYear}|${departmentId}|${level}|${String(name || '').trim().toLowerCase()}`;
  const distributionKey = (academicYear, departmentId, level) => `${academicYear}|${departmentId}|${level}`;
  const rosterFor = (departmentId, academicYear, level) => (DATA.rosters || []).find((roster) => roster.departmentId === departmentId && roster.academicYear === academicYear && roster.level === level && roster.status !== 'Archived') || null;
  const departmentContexts = () => [...new Map((DATA.rosters || []).filter((roster) => roster.status !== 'Archived').map((roster) => [distributionKey(roster.academicYear, roster.departmentId, roster.level), roster])).values()];

  DATA.groupMigrationAudit ||= [];
  DATA.academicGroups ||= [];
  DATA.groupMemberships ||= [];
  DATA.departmentDistributionPolicies ||= [];
  const inheritedGroups = Array.isArray(DATA.academicGroups) ? DATA.academicGroups.map((item) => ({ ...item })) : [];
  const inheritedMemberships = Array.isArray(DATA.groupMemberships) ? DATA.groupMemberships.map((item) => ({ ...item })) : [];
  const legacyById = new Map(inheritedGroups.map((group) => [group.id, group]));

  // Keep pre-v0.6.6 groups only as historical references. New operational groups always include departmentId.
  const historicalGroups = inheritedGroups.filter((group) => !group.departmentId).map((group) => ({ ...group, status: group.status === 'Active' ? 'Historical' : group.status, legacyAcademicScope: true }));
  const policyDefaults = { op: 'Groups Enabled', endo: 'Groups Enabled', perio: 'Groups Enabled', oral: 'No Groups' };
  const existingPolicies = new Map(DATA.departmentDistributionPolicies.map((policy) => [distributionKey(policy.academicYear, policy.departmentId, policy.level), policy]));
  const policies = [];
  departmentContexts().forEach((roster) => {
    const key = distributionKey(roster.academicYear, roster.departmentId, roster.level);
    const prior = existingPolicies.get(key);
    policies.push(prior || {
      id: `distribution-${yearCode(roster.academicYear)}-${roster.departmentId}-${levelCode(roster.level)}`,
      academicYear: roster.academicYear,
      departmentId: roster.departmentId,
      level: roster.level,
      mode: policyDefaults[roster.departmentId] || 'No Groups',
      configuredAt: '2026-08-21T00:00:00Z',
      configuredBy: actor.id,
      status: 'Active'
    });
  });
  DATA.departmentDistributionPolicies = policies;

  const groupDefinitions = [];
  const ensureGroup = ({ academicYear, departmentId, level, name, rangeStart = null, rangeEnd = null, source = 'Demo Seed v0.6.6' }) => {
    const existing = groupDefinitions.find((group) => groupKey(group.academicYear, group.departmentId, group.level, group.name) === groupKey(academicYear, departmentId, level, name));
    if (existing) return existing;
    const group = { id: `group-${yearCode(academicYear)}-${departmentId}-${levelCode(level)}-${String(name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`, academicYear, departmentId, level, name, status: 'Active', rangeStart, rangeEnd, createdAt: '2026-08-21T00:00:00Z', createdBy: actor.id, source, archivedAt: null, archivedBy: null };
    groupDefinitions.push(group);
    return group;
  };

  DATA.departmentDistributionPolicies.filter((policy) => policy.mode === 'Groups Enabled').forEach((policy) => {
    const roster = rosterFor(policy.departmentId, policy.academicYear, policy.level);
    const count = DATA.rosterStudentIds?.(roster).length || 0;
    const split = Math.max(1, Math.ceil(count / 2));
    const definition = [['Group A',1,split],['Group B',split + 1,Math.max(split + 1, count)]];
    definition.forEach(([name, start, end]) => ensureGroup({ academicYear: policy.academicYear, departmentId: policy.departmentId, level: policy.level, name, rangeStart: start, rangeEnd: end }));
  });
  DATA.academicGroups = [...historicalGroups, ...groupDefinitions].sort((a,b) => `${a.academicYear}|${a.departmentId || ''}|${a.level}|${a.name}`.localeCompare(`${b.academicYear}|${b.departmentId || ''}|${b.level}|${b.name}`, 'ar'));

  DATA.getDepartmentDistribution = (departmentId, academicYear, level) => DATA.departmentDistributionPolicies.find((policy) => policy.departmentId === departmentId && policy.academicYear === academicYear && policy.level === level && policy.status === 'Active') || null;
  DATA.departmentUsesGroups = (departmentId, academicYear, level) => DATA.getDepartmentDistribution(departmentId, academicYear, level)?.mode === 'Groups Enabled';
  DATA.getAcademicGroup = (id) => DATA.academicGroups.find((group) => group.id === id) || null;
  DATA.groupsForContext = (departmentId, academicYear, level, { includeArchived = false } = {}) => DATA.academicGroups.filter((group) => group.departmentId === departmentId && group.academicYear === academicYear && group.level === level && (includeArchived || active(group))).sort((a,b) => (a.rangeStart || 0) - (b.rangeStart || 0) || a.name.localeCompare(b.name, 'en'));
  DATA.groupsForAcademicContext = (academicYear, level, options = {}) => DATA.academicGroups.filter((group) => !group.legacyAcademicScope && group.academicYear === academicYear && group.level === level && (options.includeArchived || active(group)));
  DATA.groupMembershipsForGroup = (groupId, { includeClosed = false } = {}) => DATA.groupMemberships.filter((membership) => membership.groupId === groupId && (includeClosed || active(membership)));
  DATA.groupMembershipsForEnrollment = (enrollmentId, { includeClosed = false } = {}) => DATA.groupMemberships.filter((membership) => membership.enrollmentId === enrollmentId && (includeClosed || active(membership)));
  DATA.groupMembershipsForEnrollmentDepartment = (enrollmentId, departmentId, { includeClosed = false } = {}) => DATA.groupMemberships.filter((membership) => membership.enrollmentId === enrollmentId && membership.departmentId === departmentId && (includeClosed || active(membership)));
  DATA.groupMembershipForEnrollmentDepartment = (enrollmentId, departmentId) => DATA.groupMembershipsForEnrollmentDepartment(enrollmentId, departmentId)[0] || null;
  DATA.groupMembershipForEnrollment = (enrollmentId) => DATA.groupMembershipsForEnrollment(enrollmentId)[0] || null;
  DATA.groupStudentIds = (group, { includeArchived = false } = {}) => DATA.groupMembershipsForGroup(group?.id).filter((membership) => {
    const identity = DATA.students.find((student) => student.id === membership.studentId);
    return Boolean(identity) && (includeArchived || !DATA.isArchivedStudent?.(identity));
  }).map((membership) => membership.studentId);
  DATA.groupMembers = (group, options = {}) => DATA.groupStudentIds(group, options).map((studentId) => DATA.students.find((student) => student.id === studentId)).filter(Boolean);
  DATA.groupMembershipCount = (group) => DATA.groupStudentIds(group).length;
  DATA.departmentCohortStudentIds = (departmentId, academicYear, level) => {
    const roster = rosterFor(departmentId, academicYear, level);
    return roster ? DATA.rosterStudentIds(roster) : DATA.enrollments.filter((enrollment) => active(enrollment) && enrollment.academicYear === academicYear && enrollment.level === level).map((enrollment) => enrollment.studentId);
  };
  DATA.studentDepartmentGroupContext = (studentId, enrollmentId, departmentId) => {
    const enrollment = DATA.getEnrollment?.(enrollmentId) || DATA.currentEnrollment?.(studentId);
    const policy = enrollment && DATA.getDepartmentDistribution(departmentId, enrollment.academicYear, enrollment.level);
    if (!enrollment || !policy || policy.mode === 'No Groups') return { policy, group: null, membership: null };
    const membership = DATA.groupMembershipForEnrollmentDepartment(enrollment.id, departmentId);
    return { policy, membership, group: DATA.getAcademicGroup(membership?.groupId) || null };
  };
  DATA.validateGroupCoverage = (departmentId, academicYear, level) => {
    const policy = DATA.getDepartmentDistribution(departmentId, academicYear, level);
    const cohort = DATA.departmentCohortStudentIds(departmentId, academicYear, level);
    if (!policy || policy.mode === 'No Groups') return { valid: true, mode: 'No Groups', studentCount: cohort.length, unassignedStudentIds: [], overlaps: [] };
    const groups = DATA.groupsForContext(departmentId, academicYear, level);
    const overlaps = [];
    groups.forEach((group, index) => groups.slice(index + 1).forEach((other) => {
      if (Number.isInteger(group.rangeStart) && Number.isInteger(group.rangeEnd) && Number.isInteger(other.rangeStart) && Number.isInteger(other.rangeEnd) && Math.max(group.rangeStart, other.rangeStart) <= Math.min(group.rangeEnd, other.rangeEnd)) overlaps.push([group.id, other.id]);
    }));
    const unassignedStudentIds = cohort.filter((studentId) => !DATA.groupMembershipForEnrollmentDepartment(DATA.currentEnrollment(studentId)?.id, departmentId));
    return { valid: !overlaps.length && !unassignedStudentIds.length, mode: policy.mode, studentCount: cohort.length, unassignedStudentIds, overlaps };
  };
  DATA.setDepartmentDistribution = ({ departmentId, academicYear, level, mode, actorInfo = actor, at = now() }) => {
    if (!['No Groups','Groups Enabled'].includes(mode)) throw new Error('Invalid distribution mode');
    let policy = DATA.getDepartmentDistribution(departmentId, academicYear, level);
    if (!policy) { policy = { id: uid('distribution'), departmentId, academicYear, level, mode, status: 'Active', configuredAt: at, configuredBy: actorInfo.id }; DATA.departmentDistributionPolicies.push(policy); }
    if (mode === 'No Groups' && DATA.groupMembershipsForEnrollmentDepartment) {
      DATA.groupMemberships.filter((membership) => membership.departmentId === departmentId && active(membership) && DATA.getEnrollment(membership.enrollmentId)?.academicYear === academicYear && DATA.getEnrollment(membership.enrollmentId)?.level === level).forEach((membership) => DATA.removeGroupMembership(membership.id, actorInfo, at, 'Department changed to Full Cohort'));
    }
    policy.mode = mode;
    policy.updatedAt = at;
    policy.updatedBy = actorInfo.id;
    return policy;
  };
  DATA.createAcademicGroup = ({ departmentId, academicYear, level, name, rangeStart = null, rangeEnd = null, actorInfo = actor, at = now() }) => {
    const normalized = String(name || '').trim();
    if (!departmentId || !academicYear || !level || !normalized || !DATA.departmentUsesGroups(departmentId, academicYear, level)) throw new Error('Groups are not enabled for this department context');
    if (DATA.groupsForContext(departmentId, academicYear, level, { includeArchived: true }).some((group) => group.name.toLowerCase() === normalized.toLowerCase() && group.status !== 'Archived')) throw new Error('Group name already exists in this department and level');
    const candidate = { id: uid('group'), departmentId, academicYear, level, name: normalized, status: 'Active', rangeStart: rangeStart === '' ? null : Number(rangeStart), rangeEnd: rangeEnd === '' ? null : Number(rangeEnd), createdAt: at, createdBy: actorInfo.id, archivedAt: null, archivedBy: null };
    DATA.academicGroups.push(candidate);
    return candidate;
  };
  DATA.renameAcademicGroup = (groupId, name, actorInfo = actor, at = now()) => {
    const group = DATA.getAcademicGroup(groupId); const normalized = String(name || '').trim();
    if (!group || !active(group) || !group.departmentId || !normalized) throw new Error('Invalid academic group rename');
    group.name = normalized; group.updatedAt = at; group.updatedBy = actorInfo.id; return group;
  };
  DATA.defineGroupRange = (groupId, rangeStart, rangeEnd, actorInfo = actor, at = now()) => {
    const group = DATA.getAcademicGroup(groupId); const start = Number(rangeStart), end = Number(rangeEnd);
    if (!group || !active(group) || !group.departmentId || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) throw new Error('Invalid group range');
    const cohort = DATA.departmentCohortStudentIds(group.departmentId, group.academicYear, group.level);
    if (end > cohort.length) throw new Error('Group range exceeds the department roster size');
    const peers = DATA.groupsForContext(group.departmentId, group.academicYear, group.level).filter((item) => item.id !== group.id);
    if (peers.some((peer) => Number.isInteger(peer.rangeStart) && Number.isInteger(peer.rangeEnd) && Math.max(start, peer.rangeStart) <= Math.min(end, peer.rangeEnd))) throw new Error('Group range overlaps another group');
    group.rangeStart = start; group.rangeEnd = end; group.updatedAt = at; group.updatedBy = actorInfo.id; return group;
  };
  DATA.assignGroupMembership = ({ studentId, enrollmentId, departmentId, groupId, actorInfo = actor, source = 'Manual', at = now() }) => {
    const identity = DATA.students.find((student) => student.id === studentId), enrollment = DATA.getEnrollment?.(enrollmentId), group = DATA.getAcademicGroup(groupId);
    if (!identity || !enrollment || !group || !departmentId || !active(enrollment) || !active(group) || enrollment.studentId !== studentId || group.departmentId !== departmentId || enrollment.academicYear !== group.academicYear || enrollment.level !== group.level || !DATA.departmentUsesGroups(departmentId, enrollment.academicYear, enrollment.level)) throw new Error('Invalid department group membership input');
    if (!DATA.departmentCohortStudentIds(departmentId, enrollment.academicYear, enrollment.level).includes(studentId)) throw new Error('Student is not in this department roster');
    const current = DATA.groupMembershipForEnrollmentDepartment(enrollmentId, departmentId);
    if (current?.groupId === groupId) return current;
    if (current) { current.status = 'Moved'; current.removedAt = at; current.removedBy = actorInfo.id; current.removalReason = 'Moved within department distribution'; }
    const membership = { id: uid('group-membership'), groupId, departmentId, studentId, enrollmentId, status: 'Active', assignedAt: at, removedAt: null, removedBy: null, removalReason: null, source };
    DATA.groupMemberships.push(membership); DATA.addLifecycleEvent?.(studentId, 'Department group membership assigned', { membershipId: membership.id, departmentId, groupId, enrollmentId, source }, actorInfo, at); DATA.refreshDynamicCounts?.(); return membership;
  };
  DATA.assignDepartmentGroupsByRange = (departmentId, academicYear, level, actorInfo = actor, at = now()) => {
    if (!DATA.departmentUsesGroups(departmentId, academicYear, level)) throw new Error('This department uses Full Cohort');
    const groups = DATA.groupsForContext(departmentId, academicYear, level); const roster = rosterFor(departmentId, academicYear, level); const ordered = DATA.rosterStudentIds(roster);
    const validation = DATA.validateGroupCoverage(departmentId, academicYear, level);
    if (validation.overlaps.length) throw new Error('Fix overlapping group ranges before assignment');
    const uncovered = [];
    ordered.forEach((studentId, index) => { const group = groups.find((item) => Number.isInteger(item.rangeStart) && index + 1 >= item.rangeStart && index + 1 <= item.rangeEnd); const enrollment = DATA.currentEnrollment(studentId); if (group && enrollment) DATA.assignGroupMembership({ studentId, enrollmentId: enrollment.id, departmentId, groupId: group.id, actorInfo, source: 'Range-based', at }); else uncovered.push(studentId); });
    return { assigned: ordered.length - uncovered.length, uncoveredStudentIds: uncovered, validation: DATA.validateGroupCoverage(departmentId, academicYear, level) };
  };
  DATA.removeGroupMembership = (membershipId, actorInfo = actor, at = now(), reason = 'Removed from department group') => { const membership = DATA.groupMemberships.find((item) => item.id === membershipId); if (!membership || !active(membership)) return null; membership.status = 'Removed'; membership.removedAt = at; membership.removedBy = actorInfo.id; membership.removalReason = reason; DATA.refreshDynamicCounts?.(); return membership; };
  DATA.closeGroupMembershipsForEnrollment = (enrollmentId, actorInfo = actor, at = now(), reason = 'Enrollment closed') => DATA.groupMembershipsForEnrollment(enrollmentId).map((membership) => { membership.status = 'Closed'; membership.removedAt = at; membership.removedBy = actorInfo.id; membership.removalReason = reason; return membership; });
  DATA.archiveAcademicGroup = (groupId, actorInfo = actor, at = now()) => { const group = DATA.getAcademicGroup(groupId); if (!group || !active(group) || !group.departmentId || DATA.groupMembershipCount(group)) throw new Error('Move or remove active students before archiving this group'); group.status = 'Archived'; group.archivedAt = at; group.archivedBy = actorInfo.id; return group; };

  // Seed operational memberships independently for every department using groups; Full Cohort intentionally gets no membership.
  DATA.departmentDistributionPolicies.filter((policy) => policy.mode === 'Groups Enabled').forEach((policy) => {
    const roster = rosterFor(policy.departmentId, policy.academicYear, policy.level); const ids = DATA.rosterStudentIds(roster); const groups = DATA.groupsForContext(policy.departmentId, policy.academicYear, policy.level);
    ids.forEach((studentId, index) => { const enrollment = DATA.currentEnrollment(studentId); const assigned = groups.find((group) => index + 1 >= group.rangeStart && index + 1 <= group.rangeEnd) || groups[index % Math.max(groups.length,1)]; if (enrollment && assigned && !DATA.groupMembershipForEnrollmentDepartment(enrollment.id, policy.departmentId)) DATA.groupMemberships.push({ id: `group-seed-${policy.departmentId}-${assigned.id}-${enrollment.id}`, departmentId: policy.departmentId, groupId: assigned.id, studentId, enrollmentId: enrollment.id, status: 'Active', assignedAt: enrollment.startedAt || '2026-08-21T00:00:00Z', removedAt: null, removedBy: null, removalReason: null, source: 'Demo Seed v0.6.6 Range-based' }); });
  });
  const baseRefreshDynamicCounts = DATA.refreshDynamicCounts;
  DATA.refreshDynamicCounts = () => { const result = baseRefreshDynamicCounts?.() || {}; DATA.academicGroups.filter((group) => group.departmentId).forEach((group) => { group.studentCount = DATA.groupMembershipCount(group); }); return { ...result, groupCounts: Object.fromEntries(DATA.academicGroups.filter((group) => group.departmentId).map((group) => [group.id, group.studentCount])) }; };
  DATA.refreshDynamicCounts();
})();
