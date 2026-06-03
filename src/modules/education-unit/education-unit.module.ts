import { Module } from '@nestjs/common';
import { EducationUnitService } from './education-unit.service';
import { EducationUnitController } from './education-unit.controller';

@Module({
  providers: [EducationUnitService],
  controllers: [EducationUnitController]
})
export class EducationUnitModule {}
