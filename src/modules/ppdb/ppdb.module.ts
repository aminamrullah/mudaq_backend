import { Module } from '@nestjs/common';
import { PpdbService } from './ppdb.service';
import { PpdbController } from './ppdb.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PpdbController],
  providers: [PpdbService],
  exports: [PpdbService],
})
export class PpdbModule {}
