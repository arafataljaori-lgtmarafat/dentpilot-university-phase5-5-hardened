export class DomainError extends Error {
  constructor(public readonly code: 'ILLEGAL_TRANSITION' | 'IMMUTABLE_RECORD' | 'VALIDATION_ERROR' | 'CONFLICT', message: string) { super(message); }
}

export type EnrollmentStatus = 'ACTIVE' | 'CLOSED';
export type MembershipStatus = 'ACTIVE' | 'CLOSED' | 'REMOVED';
export type DistributionMode = 'FULL_COHORT' | 'GROUPS_ENABLED';
export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUESTED' | 'APPROVED_START' | 'APPROVED_FINAL' | 'GRADED';
export type TermResultStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'LOCKED' | 'REOPENED';

const transitions: Record<string, readonly string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['REVISION_REQUESTED', 'APPROVED_START'],
  REVISION_REQUESTED: ['SUBMITTED'],
  APPROVED_START: ['APPROVED_FINAL'],
  APPROVED_FINAL: ['GRADED'],
  GRADED: [],
};

export function assertSubmissionTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!transitions[from]?.includes(to)) throw new DomainError('ILLEGAL_TRANSITION', `Cannot transition submission from ${from} to ${to}.`);
}

export function assertTermResultTransition(from: TermResultStatus, to: TermResultStatus, reason?: string): void {
  const allowed: Record<TermResultStatus, readonly TermResultStatus[]> = { DRAFT: ['REVIEWED'], REVIEWED: ['APPROVED'], APPROVED: ['LOCKED'], LOCKED: ['REOPENED'], REOPENED: ['REVIEWED'] };
  if (!allowed[from].includes(to)) throw new DomainError('ILLEGAL_TRANSITION', `Cannot transition term result from ${from} to ${to}.`);
  if (to === 'REOPENED' && !reason?.trim()) throw new DomainError('VALIDATION_ERROR', 'Term result reopen requires a reason.');
}

export function assertGradeAmendment(reason?: string): void {
  if (!reason?.trim()) throw new DomainError('VALIDATION_ERROR', 'Grade amendment requires a reason.');
}

export function assertGroupMembership(mode: DistributionMode, activeMemberships: number): void {
  if (mode === 'FULL_COHORT') throw new DomainError('CONFLICT', 'Group membership is forbidden for Full Cohort distribution.');
  if (mode === 'GROUPS_ENABLED' && activeMemberships > 1) throw new DomainError('CONFLICT', 'An enrollment may have only one active group per department context.');
}

export function assertPublishedVersionImmutable(existingStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'): void {
  if (existingStatus !== 'DRAFT') throw new DomainError('IMMUTABLE_RECORD', 'Only a draft version can be edited.');
}

export function assertOptimisticLock(expectedVersion: number, actualVersion: number): void {
  if (expectedVersion !== actualVersion) throw new DomainError('CONFLICT', 'The record changed since it was read. Refresh and retry.');
}

export function normalizeCsvCell(value: string): string { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
export * from './supervisor.js';