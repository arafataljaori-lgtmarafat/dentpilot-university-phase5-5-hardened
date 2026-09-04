import { DomainError } from './index.js';

export type SupervisorAction = 'START_APPROVAL' | 'COMPLETION_APPROVAL' | 'CASESHEET_EVALUATION' | 'CLINICAL_FEEDBACK';

export class ClinicalEvaluationPolicy {
  static validateScore(score: number): void {
    if (typeof score !== 'number' || isNaN(score)) {
      throw new DomainError('VALIDATION_ERROR', 'Evaluation score must be a valid number.');
    }
    if (score < 0 || score > 10) {
      throw new DomainError('VALIDATION_ERROR', 'Evaluation score must be between 0 and 10.');
    }
  }
}
