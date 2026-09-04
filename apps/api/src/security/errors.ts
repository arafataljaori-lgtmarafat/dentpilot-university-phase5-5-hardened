import type { FastifyReply } from 'fastify';
import type { ErrorCode } from '@dentpilot/contracts';

export class ApiProblem extends Error {
  constructor(public readonly statusCode: number, public readonly code: ErrorCode, message: string, public readonly details?: Record<string, string[]>) { super(message); }
}

export function sendProblem(reply: FastifyReply, requestId: string, problem: ApiProblem): void {
  reply.code(problem.statusCode).send({ error: { code: problem.code, message: problem.message, requestId, ...(problem.details ? { details: problem.details } : {}) } });
}
