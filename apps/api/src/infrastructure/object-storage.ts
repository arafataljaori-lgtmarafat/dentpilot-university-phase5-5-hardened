import crypto from 'node:crypto';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class ObjectStorage {
  private readonly bucket = 'dentpilot-private';
  private readonly client: S3Client;
  constructor(endpoint: string, accessKeyId: string, secretAccessKey: string) { this.client=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}}); }
  async ensureBucket(): Promise<void> { try { await this.client.send(new HeadBucketCommand({Bucket:this.bucket})); } catch { await this.client.send(new CreateBucketCommand({Bucket:this.bucket})); } }
  async readiness(): Promise<boolean> { try { await this.client.send(new HeadBucketCommand({Bucket:this.bucket})); return true; } catch { return false; } }
  createObjectKey(organizationId: string): string { return `${organizationId}/${crypto.randomUUID()}`; }
  async signedUpload(objectKey:string, contentType:string, byteSize:number, sha256Hex:string): Promise<{url:string;requiredHeaders:Record<string,string>}> {
    const checksum = Buffer.from(sha256Hex, 'hex').toString('base64');
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({Bucket:this.bucket,Key:objectKey,ContentType:contentType,ContentLength:byteSize,ChecksumSHA256:checksum}),
      {expiresIn:300,signableHeaders:new Set(['content-type','content-length'])},
    );
    return {url,requiredHeaders:{'content-type':contentType,'content-length':String(byteSize),'x-amz-checksum-sha256':checksum}};
  }
  async signedRead(objectKey:string): Promise<string> { return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:objectKey}),{expiresIn:300}); }
  async inspectObject(objectKey:string): Promise<{contentType:string;byteSize:number;sha256:string}> {
    const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:objectKey}));
    if(!response.Body) throw new Error('Uploaded object body is unavailable.');
    const body=Buffer.from(await response.Body.transformToByteArray());
    return {contentType:response.ContentType??'',byteSize:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')};
  }
  async deleteObject(objectKey:string): Promise<void> { await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:objectKey})); }
}
