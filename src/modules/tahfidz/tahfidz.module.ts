import { Module } from '@nestjs/common';
import { TahfidzService } from './tahfidz.service';
import { TahfidzController } from './tahfidz.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TahfidzController],
  providers: [TahfidzService],
})
export class TahfidzModule {}
