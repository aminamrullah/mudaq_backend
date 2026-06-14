import { Module } from '@nestjs/common';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FaceRecognitionService } from '../teacher-attendance/face-recognition.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EmployeeController],
  providers: [EmployeeService, FaceRecognitionService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
