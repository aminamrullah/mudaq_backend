import { Test, TestingModule } from '@nestjs/testing';
import { TeachingJournalController } from './teaching-journal.controller';

describe('TeachingJournalController', () => {
  let controller: TeachingJournalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachingJournalController],
    }).compile();

    controller = module.get<TeachingJournalController>(TeachingJournalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
