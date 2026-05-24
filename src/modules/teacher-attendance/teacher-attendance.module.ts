import { Module } from '@nestjs/common';
import { TeacherAttendanceController } from './teacher-attendance.controller';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { FaceRecognitionService } from './face-recognition.service';

@Module({
  controllers: [TeacherAttendanceController],
  providers: [TeacherAttendanceService, FaceRecognitionService]
})
export class TeacherAttendanceModule {}
