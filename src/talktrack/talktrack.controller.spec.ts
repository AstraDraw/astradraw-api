import { Test, TestingModule } from '@nestjs/testing';
import { TalktrackController } from './talktrack.controller';

describe('TalktrackController', () => {
  let controller: TalktrackController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TalktrackController],
    }).compile();

    controller = module.get<TalktrackController>(TalktrackController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have upload method', () => {
    expect(controller.upload).toBeDefined();
    expect(typeof controller.upload).toBe('function');
  });

  it('should have delete method', () => {
    expect(controller.delete).toBeDefined();
    expect(typeof controller.delete).toBe('function');
  });
});
