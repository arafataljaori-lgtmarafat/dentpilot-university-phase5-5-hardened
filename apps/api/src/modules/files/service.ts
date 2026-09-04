import type { PoolClient } from 'pg';
import type { AttachmentLinkDto, FileCompletionDto, PresignReadDto, PresignUploadDto } from '@dentpilot/contracts';
import type { Principal } from '../../security/auth.js';
import { AuthorizationService } from '../../security/authorization.js';
import { ApiProblem } from '../../security/errors.js';
import { IdempotencyService } from '../../infrastructure/idempotency.js';
import { ObjectStorage } from '../../infrastructure/object-storage.js';
import { AuditService } from '../audit/service.js';

interface PresignUploadInput {
  contentType: string;
  byteSize: number;
  sha256: string;
  idempotencyKey: string;
}

export class FilesService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly idempotency: IdempotencyService,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
  ) {}

  async presignUpload(client: PoolClient, principal: Principal, input: PresignUploadInput, correlationId: string): Promise<PresignUploadDto> {
    await this.authorization.assert(client, principal, 'files:access');
    const result = await this.idempotency.run(client, principal, {
      key: input.idempotencyKey,
      operation: 'file.presign-upload',
      request: { contentType: input.contentType, byteSize: input.byteSize, sha256: input.sha256.toLowerCase() },
      responseStatus: 201,
      ttlSeconds: 300,
      execute: async () => {
        const objectKey = this.storage.createObjectKey(principal.organizationId);
        const file = await client.query<{id:string}>(
          'INSERT INTO file_objects(organization_id,object_key,sha256,content_type,byte_size,created_by_account_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [principal.organizationId, objectKey, input.sha256.toLowerCase(), input.contentType, input.byteSize, principal.accountId],
        );
        const signed = await this.storage.signedUpload(objectKey, input.contentType, input.byteSize, input.sha256);
        await this.audit.append(client,principal,{action:'FILE_UPLOAD_AUTHORIZED',entityType:'file_object',entityId:file.rows[0].id,correlationId,metadata:{contentType:input.contentType,byteSize:input.byteSize}});
        return { fileId: file.rows[0].id, uploadUrl: signed.url, expiresInSeconds: 300, requiredHeaders: signed.requiredHeaders };
      },
    });
    return result.body;
  }

  async completeUpload(client:PoolClient,principal:Principal,fileId:string,idempotencyKey:string,correlationId:string):Promise<FileCompletionDto>{
    await this.authorization.assert(client,principal,'files:access');
    const result=await this.idempotency.run(client,principal,{
      key:idempotencyKey,operation:'file.complete-upload',request:{fileId},responseStatus:200,
      execute:async()=>{
        const file=await client.query<{id:string;object_key:string;sha256:string;content_type:string;byte_size:string;created_by_account_id:string|null;status:'PENDING_UPLOAD'|'UPLOADED'|'LINKED';completed_at:Date|null}>('SELECT id,object_key,sha256,content_type,byte_size::text,created_by_account_id,status,completed_at FROM file_objects WHERE id=$1 FOR UPDATE',[fileId]);
        if(!file.rowCount||file.rows[0].created_by_account_id!==principal.accountId) throw new ApiProblem(404,'NOT_FOUND','File not found.');
        const current=file.rows[0];
        if(current.status!=='PENDING_UPLOAD') return {fileId:current.id,status:current.status,completedAt:current.completed_at!.toISOString()};
        const uploaded=await this.storage.inspectObject(current.object_key);
        if(uploaded.contentType!==current.content_type||uploaded.byteSize!==Number(current.byte_size)||uploaded.sha256!==current.sha256) throw new ApiProblem(409,'CONFLICT','Uploaded object does not match the authorized file metadata.');
        const completed=await client.query<{completed_at:Date}>("UPDATE file_objects SET status='UPLOADED',completed_at=now() WHERE id=$1 RETURNING completed_at",[fileId]);
        await this.audit.append(client,principal,{action:'FILE_UPLOAD_COMPLETED',entityType:'file_object',entityId:fileId,correlationId,metadata:{contentType:current.content_type,byteSize:Number(current.byte_size)}});
        return {fileId,status:'UPLOADED' as const,completedAt:completed.rows[0].completed_at.toISOString()};
      },
    });
    return result.body;
  }

  async linkToDraft(client:PoolClient,principal:Principal,fileId:string,draftId:string,idempotencyKey:string,correlationId:string):Promise<AttachmentLinkDto>{
    await this.authorization.assert(client,principal,'files:access',{studentId:principal.studentId});
    if(principal.role!=='STUDENT_INTEGRATION'||!principal.studentId) throw new ApiProblem(403,'FORBIDDEN','Only the owning student integration principal can link draft attachments.');
    const result=await this.idempotency.run(client,principal,{
      key:idempotencyKey,operation:'file.link-draft',request:{fileId,draftId},responseStatus:201,
      execute:async()=>{
        const file=await client.query<{id:string;created_by_account_id:string|null;status:'PENDING_UPLOAD'|'UPLOADED'|'LINKED'}>('SELECT id,created_by_account_id,status FROM file_objects WHERE id=$1 FOR UPDATE',[fileId]);
        if(!file.rowCount||file.rows[0].created_by_account_id!==principal.accountId) throw new ApiProblem(404,'NOT_FOUND','File not found.');
        if(file.rows[0].status!=='UPLOADED') throw new ApiProblem(409,'ILLEGAL_TRANSITION','Only a completed, unlinked upload can be attached.');
        const draft=await client.query<{id:string}>('SELECT id FROM student_drafts WHERE id=$1 AND student_id=$2 FOR UPDATE',[draftId,principal.studentId]);
        if(!draft.rowCount) throw new ApiProblem(404,'NOT_FOUND','Draft not found.');
        const attachment=await client.query<{id:string}>('INSERT INTO attachments(organization_id,file_object_id,draft_id) VALUES($1,$2,$3) RETURNING id',[principal.organizationId,fileId,draftId]);
        await client.query("UPDATE file_objects SET status='LINKED' WHERE id=$1",[fileId]);
        await this.audit.append(client,principal,{action:'FILE_ATTACHMENT_LINKED',entityType:'attachment',entityId:attachment.rows[0].id,correlationId,metadata:{fileId,draftId}});
        return {attachmentId:attachment.rows[0].id,fileId,draftId};
      },
    });
    return result.body;
  }

  async presignRead(client: PoolClient, principal: Principal, fileId: string): Promise<PresignReadDto> {
    const result = await client.query<{
      object_key:string;
      created_by_account_id:string|null;
      snapshot_id:string|null;
      department_id:string|null;
      supervisor_assignment_id:string|null;
      academic_year_id:string|null;
      academic_level_id:string|null;
      cohort_id:string|null;
      group_id:string|null;
      status:'PENDING_UPLOAD'|'UPLOADED'|'LINKED';
    }>(
      'SELECT f.object_key,f.created_by_account_id,f.status,a.snapshot_id,ss.department_id,ss.supervisor_assignment_id,ss.academic_year_id,ss.academic_level_id,ss.cohort_id,ss.group_id FROM file_objects f LEFT JOIN attachments a ON a.file_object_id=f.id LEFT JOIN submission_snapshots ss ON ss.id=a.snapshot_id WHERE f.id=$1',
      [fileId],
    );
    if (!result.rowCount) throw new ApiProblem(404, 'NOT_FOUND', 'File not found.');
    const file = result.rows[0];
    if(file.status==='PENDING_UPLOAD') throw new ApiProblem(404,'NOT_FOUND','File not found.');
    if (file.created_by_account_id === principal.accountId) {
      await this.authorization.assert(client, principal, 'files:access');
    } else if (file.snapshot_id && file.department_id && file.supervisor_assignment_id) {
      await this.authorization.assert(client, principal, 'cases:review', {
        departmentId: file.department_id,
        assignmentId: file.supervisor_assignment_id,
        assignmentPermission: 'reviewCases',
        academicYearId: file.academic_year_id ?? undefined,
        academicLevelId: file.academic_level_id ?? undefined,
        cohortId: file.cohort_id ?? undefined,
        groupId: file.group_id ?? undefined,
      });
    } else {
      throw new ApiProblem(404, 'NOT_FOUND', 'File not found.');
    }
    return { readUrl: await this.storage.signedRead(file.object_key), expiresInSeconds: 300 };
  }
}
