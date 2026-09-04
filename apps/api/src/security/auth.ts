import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PoolClient } from 'pg';
import { Database } from '../infrastructure/db.js';
import { ApiProblem } from './errors.js';

export interface Principal { accountId: string; organizationId: string; collegeId: string|null; role: 'UNIVERSITY_ADMIN' | 'DEPARTMENT_ADMIN' | 'CLINICAL_SUPERVISOR' | 'STUDENT_INTEGRATION'; departmentIds: string[]; studentId?: string; }
const SESSION_COOKIE = 'dp_session'; const CSRF_COOKIE = 'dp_csrf';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');

export class AuthService {
  private readonly dummyPasswordHash = argon2.hash(random(), { type: argon2.argon2id });
  constructor(private readonly db: Database, private readonly cookieSecure: boolean) {}
  async login(organizationId: string, email: string, password: string, correlationId: string): Promise<{ principal: Principal; sessionValue: string; csrfToken: string }> {
    const outcome = await this.db.withTenant({ organizationId }, async (client): Promise<{result?:{ principal: Principal; sessionValue: string; csrfToken: string };problem?:ApiProblem}> => {
      const account = await client.query<{ id:string; organization_id:string; college_id:string|null; password_hash:string; status:'ACTIVE'|'DISABLED'|'PENDING'; primary_role:Principal['role']; student_id?:string }>('SELECT id, organization_id, college_id, password_hash, status, primary_role, student_id FROM accounts WHERE organization_id=$1 AND email=$2', [organizationId,email]);
      const passwordValid=await argon2.verify(account.rows[0]?.password_hash ?? await this.dummyPasswordHash,password);
      if (!account.rowCount || !passwordValid) { await this.auditAuth(client, organizationId, null, null, 'LOGIN_FAILED', correlationId); return {problem:new ApiProblem(401, 'AUTHENTICATION_REQUIRED', 'Invalid email or password.')}; }
      const row = account.rows[0];
      if (row.status !== 'ACTIVE') { await this.auditAuth(client, organizationId, row.id, row.primary_role, 'LOGIN_DENIED_ACCOUNT_STATUS', correlationId); return {problem:new ApiProblem(403, 'ACCOUNT_DISABLED', 'Account is not active.')}; }
      const token = random(); const csrfToken = random(); const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL', [row.id]);
      await client.query('INSERT INTO sessions(organization_id,account_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,$4,$5)', [organizationId,row.id,hash(token),hash(csrfToken),expiresAt]);
      await client.query('UPDATE accounts SET last_login_at=now() WHERE id=$1', [row.id]); await this.auditAuth(client, organizationId, row.id, row.primary_role, 'LOGIN_SUCCEEDED', correlationId);
      return {result:{ principal: await this.principalFor(client, row), sessionValue: `${organizationId}.${token}`, csrfToken }};
    });
    if (outcome.problem) throw outcome.problem;
    if (!outcome.result) throw new ApiProblem(500, 'INTERNAL_ERROR', 'Authentication outcome was not produced.');
    return outcome.result;
  }
  setCookies(reply: FastifyReply, sessionValue: string, csrfToken: string): void {
    reply.setCookie(SESSION_COOKIE, sessionValue, { httpOnly: true, secure: this.cookieSecure, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60, signed: false });
    reply.setCookie(CSRF_COOKIE, csrfToken, { httpOnly: false, secure: this.cookieSecure, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60, signed: false });
  }
  clearCookies(reply: FastifyReply): void { reply.clearCookie(SESSION_COOKIE, { path: '/' }); reply.clearCookie(CSRF_COOKIE, { path: '/' }); }
  async authenticate(request: FastifyRequest): Promise<Principal> {
    const raw = request.cookies[SESSION_COOKIE]; const [organizationId, token] = raw?.split('.') ?? [];
    if (!organizationId || !token || !/^[0-9a-f-]{36}$/i.test(organizationId)) throw new ApiProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    return this.db.withTenant({ organizationId }, async (client) => {
      const result = await client.query<{id:string; account_id:string; organization_id:string; expires_at:Date; revoked_at:Date|null; status:'ACTIVE'|'DISABLED'|'PENDING'; primary_role:Principal['role']; college_id:string|null; student_id?:string}>('SELECT s.id,s.account_id,s.organization_id,s.expires_at,s.revoked_at,a.status,a.primary_role,a.college_id,a.student_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1', [hash(token)]);
      const session = result.rows[0];
      if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) throw new ApiProblem(401, 'AUTHENTICATION_REQUIRED', 'Session is invalid or expired.');
      if (session.status !== 'ACTIVE') throw new ApiProblem(403, 'ACCOUNT_DISABLED', 'Account is not active.');
      const scopes = await client.query<{department_id:string}>('SELECT department_id FROM account_scopes WHERE account_id=$1 AND department_id IS NOT NULL', [session.account_id]);
      return { accountId:session.account_id, organizationId:session.organization_id, collegeId:session.college_id, role:session.primary_role, departmentIds:scopes.rows.map((scope) => scope.department_id), ...(session.student_id ? { studentId: session.student_id } : {}) };
    });
  }
  async assertCsrf(request: FastifyRequest, principal: Principal): Promise<void> {
    if (['GET','HEAD','OPTIONS'].includes(request.method)) return;
    const raw = request.cookies[SESSION_COOKIE]; const token = request.headers['x-csrf-token']; const [, sessionToken] = raw?.split('.') ?? [];
    if (typeof token !== 'string' || request.cookies[CSRF_COOKIE] !== token || !sessionToken) throw new ApiProblem(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const valid = await this.db.withTenant(principal, async (client) => (await client.query('SELECT 1 FROM sessions WHERE account_id=$1 AND token_hash=$2 AND csrf_hash=$3 AND revoked_at IS NULL AND expires_at>now()', [principal.accountId,hash(sessionToken),hash(token)])).rowCount === 1);
    if (!valid) throw new ApiProblem(403, 'CSRF_INVALID', 'CSRF validation failed.');
  }
  async logout(request: FastifyRequest, principal: Principal, correlationId: string): Promise<void> {
    const [, token] = request.cookies[SESSION_COOKIE]?.split('.') ?? [];
    if (!token) return;
    await this.db.withTenant(principal, async (client) => { await client.query('UPDATE sessions SET revoked_at=now() WHERE account_id=$1 AND token_hash=$2 AND revoked_at IS NULL', [principal.accountId,hash(token)]); await this.auditAuth(client,principal.organizationId,principal.accountId,principal.role,'LOGOUT',correlationId); });
  }
  // studentId is required for a STUDENT_INTEGRATION invitation and forbidden for every
  // other role — enforced here, not as a Zod cross-field rule in app.ts, matching how
  // other role-conditional business rules in this codebase (e.g. assertGradeAmendment)
  // live in service/domain code rather than in route schemas. The student must exist
  // in the caller's own organization (guaranteed by running the lookup inside
  // db.withTenant, so RLS scopes it) and must not already be linked to an account —
  // checked here for a fast, clear rejection, and backstopped at redemption time by
  // the accounts_student_id_unique partial index (0003_student_integration.sql) so a
  // race between two invitations for the same student can never produce two accounts.
  async issueInvitation(principal: Principal, email: string, role: Principal['role'], studentId: string|undefined, correlationId: string): Promise<string> {
    if (role==='STUDENT_INTEGRATION') { if (!studentId) throw new ApiProblem(400,'VALIDATION_ERROR','A student invitation requires studentId.'); }
    else if (studentId) throw new ApiProblem(400,'VALIDATION_ERROR','studentId is only accepted for STUDENT_INTEGRATION invitations.');
    const token=random();
    await this.db.withTenant(principal, async (client) => {
      if (studentId) {
        const student=await client.query('SELECT 1 FROM students WHERE id=$1',[studentId]);
        if (!student.rowCount) throw new ApiProblem(404,'NOT_FOUND','Student not found.');
        const linked=await client.query('SELECT 1 FROM accounts WHERE student_id=$1',[studentId]);
        if (linked.rowCount) throw new ApiProblem(409,'CONFLICT','Student is already linked to an account.');
      }
      await client.query('INSERT INTO invitations(organization_id,email,role,student_id,token_hash,expires_at,created_by_account_id) VALUES($1,$2,$3,$4,$5,now()+interval \'72 hours\',$6)', [principal.organizationId,email,role,studentId??null,hash(token),principal.accountId]);
      await this.auditAuth(client,principal.organizationId,principal.accountId,principal.role,'INVITATION_ISSUED',correlationId);
    });
    return token;
  }
  async redeemInvitation(organizationId: string, token: string, password: string, correlationId: string): Promise<void> { await this.db.withTenant({organizationId}, async (client) => { const invitation = await client.query<{id:string;email:string;role:Principal['role']; expires_at:Date; used_at:Date|null; revoked_at:Date|null; college_id:string|null; student_id:string|null}>('SELECT i.id,i.email,i.role,i.expires_at,i.used_at,i.revoked_at,i.student_id,a.college_id FROM invitations i LEFT JOIN accounts a ON a.id=i.created_by_account_id WHERE i.token_hash=$1 FOR UPDATE OF i',[hash(token)]); const item=invitation.rows[0]; if (!item || item.used_at || item.revoked_at || new Date(item.expires_at)<=new Date()) throw new ApiProblem(400,'INVITATION_INVALID','Invitation is invalid, expired, or already used.'); const passwordHash=await argon2.hash(password,{type:argon2.argon2id}); await client.query('INSERT INTO accounts(organization_id,college_id,email,password_hash,status,primary_role,student_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[organizationId,item.college_id,item.email,passwordHash,'ACTIVE',item.role,item.student_id]); await client.query('UPDATE invitations SET used_at=now() WHERE id=$1',[item.id]); await this.auditAuth(client,organizationId,null,item.role,'INVITATION_REDEEMED',correlationId); }); }
  /**
   * Issues an invitation within an *already-open* tenant PoolClient.
   * Used by SupervisorService.reissueInvitation so that token generation
   * and the invitation INSERT remain inside AuthService — never in business
   * logic modules.  The caller is responsible for the surrounding transaction.
   */
  async issueInvitationOnClient(client: PoolClient, principal: Principal, email: string, role: Principal['role'], studentId: string | null, correlationId: string): Promise<string> {
    const token = random();
    await client.query('INSERT INTO invitations(organization_id,email,role,student_id,token_hash,expires_at,created_by_account_id) VALUES($1,$2,$3,$4,$5,now()+interval \'72 hours\',$6)', [principal.organizationId, email, role, studentId, hash(token), principal.accountId]);
    await this.auditAuth(client, principal.organizationId, principal.accountId, principal.role, 'INVITATION_ISSUED', correlationId);
    return token;
  }
  private async principalFor(client: PoolClient, account: {id:string; organization_id:string; college_id:string|null; primary_role:Principal['role']; student_id?:string}): Promise<Principal> { const scopes=await client.query<{department_id:string}>('SELECT department_id FROM account_scopes WHERE account_id=$1 AND department_id IS NOT NULL',[account.id]); return {accountId:account.id,organizationId:account.organization_id,collegeId:account.college_id,role:account.primary_role,departmentIds:scopes.rows.map((scope)=>scope.department_id),...(account.student_id?{studentId:account.student_id}:{})}; }
  private async auditAuth(client: PoolClient, organizationId:string, actorId:string|null, role:Principal['role']|null, action:string, correlationId:string): Promise<void> {
    const audit=await client.query<{id:string}>('INSERT INTO audit_events(organization_id,actor_account_id,actor_role,action,entity_type,correlation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[organizationId,actorId,role,action,'session',correlationId]);
    await client.query('INSERT INTO outbox_events(organization_id,topic,payload) VALUES($1,$2,$3)',[organizationId,'audit.recorded',{auditEventId:audit.rows[0].id,action,entityType:'session',correlationId}]);
  }
}
