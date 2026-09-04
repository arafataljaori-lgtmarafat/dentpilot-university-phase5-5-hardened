import type { PoolClient } from 'pg';
import type { Principal } from '../../security/auth.js';

export class AuditService {
  async append(client: PoolClient, principal: Principal, event: { action: string; entityType: string; entityId?: string; departmentId?: string; correlationId: string; reason?: string; before?: Record<string, unknown>; after?: Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<void> {
    const audit = await client.query<{id:string}>('INSERT INTO audit_events(organization_id,actor_account_id,actor_role,action,entity_type,entity_id,department_id,correlation_id,reason,before_state,after_state,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id', [principal.organizationId,principal.accountId,principal.role,event.action,event.entityType,event.entityId ?? null,event.departmentId ?? null,event.correlationId,event.reason ?? null,event.before ?? null,event.after ?? null,event.metadata ?? {}]);
    await client.query('INSERT INTO outbox_events(organization_id,topic,payload) VALUES($1,$2,$3)', [principal.organizationId,'audit.recorded',{auditEventId:audit.rows[0].id,action:event.action,entityType:event.entityType,entityId:event.entityId ?? null,correlationId:event.correlationId}]);
  }
}
