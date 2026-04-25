import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import { config } from '../../config';
import { logger } from './logger';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF"
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],   // "GIF8"
};

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

    // Validate magic bytes to prevent MIME spoofing
    const expectedMagic = MAGIC_BYTES[mimeType];
    if (expectedMagic) {
      const matchesMagic = expectedMagic.some((magic) =>
        magic.every((byte, i) => buffer[i] === byte),
      );
      if (!matchesMagic) {
        throw new Error(
          `File content does not match declared type: ${mimeType}`,
        );
      }
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
