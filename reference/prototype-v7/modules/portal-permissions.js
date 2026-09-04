(function () {
  function canPerform(context, permission, item = null, options = {}) {
    const account = context.account;
    if (!account?.active || !account.permissions?.includes(permission)) return false;

    const departmentId = item?.departmentId || item?.department || options.departmentId;
    if (departmentId && !context.inDepartmentScope(departmentId)) return false;
    if (options.requireDraft && item?.status !== 'Draft') return false;
    if (options.requirePublishedReadOnly && item?.status !== 'Published') return false;
    if (options.requireActive && item?.status !== 'Active') return false;
    if (options.requireSupervisorAssignment && (!context.isSupervisor || item?.supervisorId !== account.id)) return false;
    if (options.requireClinicalScope && (!context.isSupervisor || !context.matchesSupervisorScope(account, item))) return false;
    if (options.requireAssignmentPermission) {
      const assignment = context.assignmentForCase?.(item);
      if (!context.isSupervisor || !assignment || assignment.supervisorId !== account.id || !assignment.permissions?.[options.requireAssignmentPermission]) return false;
    }
    if (options.requireClinicalRole && departmentId && !(context.departmentPolicy(departmentId)?.authorizedClinicalRoles || []).includes(account.role)) return false;
    return true;
  }

  window.PortalPermissions = { canPerform };
})();
