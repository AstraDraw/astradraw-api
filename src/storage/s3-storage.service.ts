import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSecret } from '../utils/secrets';
import { IStorageService, StorageNamespace } from './storage.interface';

/**
 * S3-compatible storage service implementation.
 * Supports MinIO, AWS S3, and other S3-compatible services.
 *
 * Configuration via environment variables (all support _FILE suffix for Docker secrets):
 * - S3_ENDPOINT: S3 endpoint URL (e.g., http://minio:9000)
 * - S3_ACCESS_KEY: Access key ID
 * - S3_SECRET_KEY: Secret access key
 * - S3_BUCKET: Bucket name (default: excalidraw)
 * - S3_REGION: Region (default: us-east-1)
 * - S3_FORCE_PATH_STYLE: Use path-style URLs (default: true, required for MinIO)
 */
@Injectable()
export class S3StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private s3Client: S3Client;
  private bucket: string;

  async onModuleInit() {
    const endpoint = getSecret('S3_ENDPOINT');
    const accessKey = getSecret('S3_ACCESS_KEY');
    const secretKey = getSecret('S3_SECRET_KEY');
    this.bucket = getSecret('S3_BUCKET') || 'excalidraw';
    const region = getSecret('S3_REGION') || 'us-east-1';
    const forcePathStyle = getSecret('S3_FORCE_PATH_STYLE') !== 'false';

    if (!endpoint) {
      throw new Error('S3_ENDPOINT is required for S3 storage backend');
    }
    if (!accessKey || !secretKey) {
      throw new Error(
        'S3_ACCESS_KEY and S3_SECRET_KEY are required for S3 storage backend',
      );
    }

    this.logger.log(
      `Initializing S3 storage with endpoint: ${endpoint}, bucket: ${this.bucket}`,
    );

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle,
    });

    // Ensure bucket exists
    await this.ensureBucketExists();

    this.logger.log(`S3 storage initialized successfully`);
  }

  /**
   * Create bucket if it doesn't exist
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        this.logger.log(`Bucket "${this.bucket}" not found, creating...`);
        try {
          await this.s3Client.send(
            new CreateBucketCommand({ Bucket: this.bucket }),
          );
          this.logger.log(`Bucket "${this.bucket}" created successfully`);
        } catch (createError: any) {
          // Bucket might have been created by another instance
          if (
            createError.name !== 'BucketAlreadyOwnedByYou' &&
            createError.name !== 'BucketAlreadyExists'
          ) {
            throw createError;
          }
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Build S3 object key from namespace and key
   * Format: {namespace}/{key}
   */
  private buildObjectKey(key: string, namespace: StorageNamespace): string {
    return `${namespace}/${key}`;
  }

  async get(key: string, namespace: StorageNamespace): Promise<Buffer | null> {
    const objectKey = this.buildObjectKey(key, namespace);

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      this.logger.error(`Error getting object ${objectKey}:`, error);
      throw error;
    }
  }

  async has(key: string, namespace: StorageNamespace): Promise<boolean> {
    const objectKey = this.buildObjectKey(key, namespace);

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return true;
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      this.logger.error(`Error checking object ${objectKey}:`, error);
      throw error;
    }
  }

  async set(
    key: string,
    value: Buffer,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    const objectKey = this.buildObjectKey(key, namespace);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: value,
          ContentType: 'application/octet-stream',
        }),
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Error putting object ${objectKey}:`, error);
      throw error;
    }
  }

  async delete(key: string, namespace: StorageNamespace): Promise<boolean> {
    const objectKey = this.buildObjectKey(key, namespace);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Error deleting object ${objectKey}:`, error);
      throw error;
    }
  }
}
