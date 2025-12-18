import { Test, TestingModule } from '@nestjs/testing';
import { ScenesController } from './scenes.controller';
import {
  STORAGE_SERVICE,
  IStorageService,
  StorageNamespace,
} from '../storage/storage.interface';

const mockStorageService: Partial<IStorageService> = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  has: jest.fn().mockResolvedValue(false),
};

describe('ScenesController', () => {
  let controller: ScenesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScenesController],
      providers: [
        {
          provide: STORAGE_SERVICE,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    controller = module.get<ScenesController>(ScenesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
