import { Module } from '@nestjs/common';
import { ShalatAttendanceService } from './shalat-attendance.service';
import { ShalatAttendanceController } from './shalat-attendance.controller';

@Module({
  controllers: [ShalatAttendanceController],
  providers: [ShalatAttendanceService],
  exports: [ShalatAttendanceService],
})
export class ShalatAttendanceModule {}
