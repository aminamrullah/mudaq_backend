import { Test, TestingModule } from '@nestjs/testing';
import { EducationUnitController } from './education-unit.controller';

describe('EducationUnitController', () => {
  let controller: EducationUnitController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EducationUnitController],
    }).compile();

    controller = module.get<EducationUnitController>(EducationUnitController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
