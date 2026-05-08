import { Module } from '@nestjs/common';
import { TeacherAttendanceController } from './teacher-attendance.controller';
import { TeacherAttendanceService } from './teacher-attendance.service';

@Module({
  controllers: [TeacherAttendanceController],
  providers: [TeacherAttendanceService]
})
export class TeacherAttendanceModule {}
