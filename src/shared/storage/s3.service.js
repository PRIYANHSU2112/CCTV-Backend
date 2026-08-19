import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.config.js';
import { logger } from '../utils/logger.js';

export class S3Service {
  constructor() {
    const s3Config = {
      region: env.AWS_REGION || 'sgp1',
      credentials: env.AWS_ACCESS_KEY_ID
        ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY
        }
        : undefined
    };

    if (env.AWS_ENDPOINT) {
      s3Config.endpoint = env.AWS_ENDPOINT;
    }

    this.client = new S3Client(s3Config);
    this.bucket = env.AWS_S3_BUCKET;
  }

  /**
   * Upload file to AWS S3 or DigitalOcean Spaces bucket with public-read ACL
   */
  async uploadFile(fileBuffer, key, mimeType) {
    try {
      const folderPrefix = (env.BUCKET_FOLDER_PATH || 'CCTV/').replace(/^\/+/, '');
      const cleanKey = String(key).replace(/^\/+/, '');
      const fullKey = cleanKey.startsWith(folderPrefix) ? cleanKey : `${folderPrefix}${cleanKey}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: 'public-read' // Ensures object is publicly accessible via web URL
      });

      await this.client.send(command);

      let fileUrl;
      if (env.AWS_ENDPOINT) {
        // DigitalOcean Spaces or custom S3 endpoint
        const cleanEndpoint = env.AWS_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if (cleanEndpoint.startsWith(`${this.bucket}.`)) {
          fileUrl = `https://${cleanEndpoint}/${fullKey}`;
        } else if (cleanEndpoint.includes('digitaloceanspaces.com')) {
          fileUrl = `https://${this.bucket}.${cleanEndpoint}/${fullKey}`;
        } else {
          fileUrl = `https://${cleanEndpoint}/${this.bucket}/${fullKey}`;
        }
      } else {
        // Standard AWS S3 URL format
        fileUrl = `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${fullKey}`;
      }

      logger.info(`☁️ File successfully uploaded to S3/Spaces: [${fileUrl}]`);
      return fileUrl;
    } catch (err) {
      logger.error(`S3/Spaces Upload Error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Delete file from S3 / Spaces bucket
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (err) {
      logger.error(`S3 Delete Error: ${err.message}`);
      return false;
    }
  }
}
