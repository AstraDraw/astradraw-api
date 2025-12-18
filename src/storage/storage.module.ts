import { Module, Global, Logger } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface';
import { KeyvStorageService } from './keyv-storage.service';
import { S3StorageService } from './s3-storage.service';
import { getSecret } from '../utils/secrets';

const logger = new Logger('StorageModule');

/**
 * Dynamic storage provider factory.
 * Selects storage implementation based on STORAGE_BACKEND environment variable.
 * 
 * Supported values:
 * - 's3' or 'minio': Use S3StorageService (MinIO, AWS S3, etc.)
 * - 'keyv' (default): Use KeyvStorageService (PostgreSQL, MongoDB, Redis, etc.)
 */
const storageProvider = {
  provide: STORAGE_SERVICE,
  useFactory: () => {
    const backend = getSecret('STORAGE_BACKEND') || 'keyv';
    
    logger.log(`Storage backend: ${backend}`);

    switch (backend.toLowerCase()) {
      case 's3':
      case 'minio':
        logger.log('Using S3StorageService');
        return new S3StorageService();
      case 'keyv':
      default:
        logger.log('Using KeyvStorageService');
        return new KeyvStorageService();
    }
  },
};

@Global()
@Module({
  providers: [storageProvider],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
