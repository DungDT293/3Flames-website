import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import { config } from '../../../config';
import { logger } from '../../../shared/infrastructure/logger';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Cloudflare R2 uses an S3-compatible endpoint:
// https://<ACCOUNT_ID>.r2.cloudflarestorage.com
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

export interface UploadResult {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
}

export class UploadService {
  /**
   * Upload a file buffer to Cloudflare R2.
   * Returns the public URL (served via R2 custom domain or public bucket URL).
   *
   * @param buffer   - Raw file bytes
   * @param filename - Original filename (used for extension extraction)
   * @param mimeType - MIME type from multer
   * @param folder   - Logical folder inside the bucket (e.g., "avatars", "thumbnails")
   */
  async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    folder: string,
  ): Promise<UploadResult> {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate a unique key: folder/hash-timestamp.ext
    const ext = path.extname(filename).toLowerCase() || '.bin';
    const hash = crypto.randomBytes(16).toString('hex');
    const key = `${folder}/${hash}-${Date.now()}${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const publicUrl = `${config.r2.publicUrl}/${key}`;

    logger.info('File uploaded to R2', {
      key,
      publicUrl,
      size: buffer.length,
      contentType: mimeType,
    });

    return {
      key,
      publicUrl,
      size: buffer.length,
      contentType: mimeType,
    };
  }

  /**
   * Delete a file from R2 by key.
   */
  async delete(key: string): Promise<void> {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
      }),
    );

    logger.info('File deleted from R2', { key });
  }
}
