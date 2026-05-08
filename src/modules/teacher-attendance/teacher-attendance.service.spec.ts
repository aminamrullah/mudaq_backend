import { Test, TestingModule } from '@nestjs/testing';
import { TeacherAttendanceService } from './teacher-attendance.service';

describe('TeacherAttendanceService', () => {
  let service: TeacherAttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeacherAttendanceService],
    }).compile();

    service = module.get<TeacherAttendanceService>(TeacherAttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
