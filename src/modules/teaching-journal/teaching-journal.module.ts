import { Module } from '@nestjs/common';
import { TeachingJournalController } from './teaching-journal.controller';
import { TeachingJournalService } from './teaching-journal.service';

@Module({
  controllers: [TeachingJournalController],
  providers: [TeachingJournalService]
})
export class TeachingJournalModule {}
