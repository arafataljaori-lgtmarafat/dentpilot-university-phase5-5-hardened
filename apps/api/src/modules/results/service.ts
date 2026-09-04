import type { PoolClient } from 'pg';
import { assertOptimisticLock, assertTermResultTransition } from '@dentpilot/domain';
import type { Principal } from '../../security/auth.js';
import { ApiProblem } from '../../security/errors.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../audit/service.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';

export class ResultsService {
  constructor(private readonly authorization: AuthorizationService, private readonly audit: AuditService, private readonly idempotency: IdempotencyService) {}
  async transition(client: PoolClient, principal: Principal, closureId: string, target: 'REVIEWED'|'APPROVED'|'LOCKED'|'REOPENED', expectedRevision: number, reason: string | undefined, idempotencyKey: string, correlationId: string): Promise<void> {
    await this.idempotency.run(client, principal, {
      key: idempotencyKey,
      operation: `term-result.${target.toLowerCase()}`,
      request: { closureId, target, expectedRevision, reason },
      responseStatus: 204,
      execute: async () => {
    const result=await client.query<{status:'DRAFT'|'REVIEWED'|'APPROVED'|'LOCKED'|'REOPENED';department_id:string;revision:number;academic_year_id:string;academic_level_id:string;cohort_id:string}>('SELECT trc.status,trc.department_id,trc.revision,t.academic_year_id,trc.academic_level_id,trc.cohort_id FROM term_result_closures trc JOIN terms t ON t.id=trc.term_id WHERE trc.id=$1 FOR UPDATE OF trc',[closureId]); if(!result.rowCount) throw new ApiProblem(404,'NOT_FOUND','Term result closure not found.'); const row=result.rows[0];
    assertOptimisticLock(expectedRevision,row.revision);
    await this.authorization.assert(client,principal,target==='LOCKED'?'term-results:lock':'term-results:approve',{departmentId:row.department_id,academicYearId:row.academic_year_id,academicLevelId:row.academic_level_id,cohortId:row.cohort_id}); assertTermResultTransition(row.status,target,reason);
    await client.query('UPDATE term_result_closures SET status=$2::term_result_status,revision=revision+1,updated_at=now(),approved_by_account_id=CASE WHEN $2::text=\'APPROVED\' THEN $3 ELSE approved_by_account_id END,locked_by_account_id=CASE WHEN $2::text=\'LOCKED\' THEN $3 ELSE locked_by_account_id END,reopened_by_account_id=CASE WHEN $2::text=\'REOPENED\' THEN $3 ELSE reopened_by_account_id END,reopen_reason=CASE WHEN $2::text=\'REOPENED\' THEN $4 ELSE reopen_reason END WHERE id=$1',[closureId,target,principal.accountId,reason??null]);
    await this.audit.append(client,principal,{action:`TERM_RESULT_${target}`,entityType:'term_result_closure',entityId:closureId,departmentId:row.department_id,correlationId,reason});
        return {};
      },
    });
  }
}
