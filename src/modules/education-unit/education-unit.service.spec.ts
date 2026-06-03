import { Test, TestingModule } from '@nestjs/testing';
import { EducationUnitService } from './education-unit.service';

describe('EducationUnitService', () => {
  let service: EducationUnitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EducationUnitService],
    }).compile();

    service = module.get<EducationUnitService>(EducationUnitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
