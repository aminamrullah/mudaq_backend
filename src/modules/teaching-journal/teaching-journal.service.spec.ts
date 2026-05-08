import { Test, TestingModule } from '@nestjs/testing';
import { TeachingJournalService } from './teaching-journal.service';

describe('TeachingJournalService', () => {
  let service: TeachingJournalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeachingJournalService],
    }).compile();

    service = module.get<TeachingJournalService>(TeachingJournalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
