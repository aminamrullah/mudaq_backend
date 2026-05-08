import { Module } from '@nestjs/common';
import { ExpenditureService } from './expenditure.service';
import { ExpenditureController } from './expenditure.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExpenditureController],
  providers: [ExpenditureService],
  exports: [ExpenditureService],
})
export class ExpenditureModule {}
