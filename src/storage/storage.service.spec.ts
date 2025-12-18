import { Test, TestingModule } from '@nestjs/testing';
import { KeyvStorageService } from './keyv-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageModule } from './storage.module';
import { STORAGE_SERVICE, IStorageService } from './storage.interface';

describe('KeyvStorageService', () => {
  let service: KeyvStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyvStorageService],
    }).compile();

    service = module.get<KeyvStorageService>(KeyvStorageService);
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('StorageModule', () => {
  it('should provide KeyvStorageService by default', async () => {
    // Clear any existing env
    delete process.env.STORAGE_BACKEND;

    const module: TestingModule = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();

    const service = module.get<IStorageService>(STORAGE_SERVICE);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(KeyvStorageService);
  });
});
