import { Test, TestingModule } from '@nestjs/testing';
import { TeacherAttendanceController } from './teacher-attendance.controller';

describe('TeacherAttendanceController', () => {
  let controller: TeacherAttendanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeacherAttendanceController],
    }).compile();

    controller = module.get<TeacherAttendanceController>(TeacherAttendanceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
