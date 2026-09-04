import { describe, expect, it } from 'vitest';
import { DomainError, assertSubmissionTransition, assertTermResultTransition, assertGradeAmendment, assertGroupMembership, assertOptimisticLock, normalizeCsvCell } from '@dentpilot/domain';

describe('domain state machines', () => {
  it('rejects illegal submission transition', () => expect(() => assertSubmissionTransition('DRAFT','APPROVED_FINAL')).toThrow(DomainError));
  it('requires a reason to reopen locked results', () => expect(() => assertTermResultTransition('LOCKED','REOPENED')).toThrow('requires a reason'));
  it('requires a reason to amend a grade', () => expect(() => assertGradeAmendment('')).toThrow('requires a reason'));
  it('forbids group membership creation in Full Cohort', () => expect(() => assertGroupMembership('FULL_COHORT',0)).toThrow(DomainError));
  it('detects stale revisions', () => expect(() => assertOptimisticLock(1,2)).toThrow('changed since it was read'));
  it('neutralizes CSV formulas', () => expect(normalizeCsvCell('=HYPERLINK("x")')).toBe("'=HYPERLINK(\"x\")"));
});
