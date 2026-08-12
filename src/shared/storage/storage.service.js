import { S3Service } from './s3.service.js';

export class StorageService {
  constructor() {
    this.s3Service = new S3Service();
  }

  async upload(fileBuffer, filename, mimeType) {
    const key = `uploads/${Date.now()}_${filename}`;
    return this.s3Service.uploadFile(fileBuffer, key, mimeType);
  }

  async remove(key) {
    return this.s3Service.deleteFile(key);
  }
}
