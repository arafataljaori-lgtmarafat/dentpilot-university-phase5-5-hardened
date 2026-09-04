import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Principal } from '../security/auth.js';
import { ApiProblem } from '../security/errors.js';

export interface IdempotentCommand<T> {
  key: string;
  operation: string;
  request: unknown;
  responseStatus: number;
  ttlSeconds?: number;
  execute: () => Promise<T>;
}

export interface IdempotentResult<T> {
  body: T;
  responseStatus: number;
  replayed: boolean;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function requestHash(operation: string, request: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ operation, request: canonicalize(request) }))
    .digest('hex');
}

export class IdempotencyService {
  async run<T>(client: PoolClient, principal: Principal, command: IdempotentCommand<T>): Promise<IdempotentResult<T>> {
    const hash = requestHash(command.operation, command.request);
    const lockScope = `${principal.organizationId}:${principal.accountId}:${command.key}`;

    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockScope]);
    await client.query(
      'DELETE FROM idempotency_keys WHERE actor_account_id=$1 AND key=$2 AND expires_at<=now()',
      [principal.accountId, command.key],
    );

    const existing = await client.query<{ request_hash: string; response_status: number; response_body: T }>(
      'SELECT request_hash,response_status,response_body FROM idempotency_keys WHERE actor_account_id=$1 AND key=$2',
      [principal.accountId, command.key],
    );
    if (existing.rowCount) {
      if (existing.rows[0].request_hash !== hash) {
        throw new ApiProblem(409, 'CONFLICT', 'Idempotency key was already used for a different request.');
      }
      return { body: existing.rows[0].response_body, responseStatus: existing.rows[0].response_status, replayed: true };
    }

    const body = await command.execute();
    await client.query(
      "INSERT INTO idempotency_keys(organization_id,actor_account_id,key,request_hash,response_status,response_body,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7 * interval '1 second'))",
      [principal.organizationId, principal.accountId, command.key, hash, command.responseStatus, JSON.stringify(body ?? {}), command.ttlSeconds ?? 86400],
    );
    return { body, responseStatus: command.responseStatus, replayed: false };
  }
}
