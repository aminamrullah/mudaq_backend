import { Module } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';

@Module({
  providers: [AnnouncementService],
  controllers: [AnnouncementController],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
