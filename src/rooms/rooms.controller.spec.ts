import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';

const mockStorageService: Partial<IStorageService> = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  has: jest.fn().mockResolvedValue(false),
};

describe('RoomsController', () => {
  let controller: RoomsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        {
          provide: STORAGE_SERVICE,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
