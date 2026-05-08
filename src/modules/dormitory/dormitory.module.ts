import { Module } from '@nestjs/common';
import { DormitoryController } from './dormitory.controller';
import { DormitoryService } from './dormitory.service';

@Module({
  controllers: [DormitoryController],
  providers: [DormitoryService],
})
export class DormitoryModule {}
