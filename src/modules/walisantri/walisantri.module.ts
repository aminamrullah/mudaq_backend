import { Module } from '@nestjs/common';
import { WalisantriController } from './walisantri.controller';
import { WalisantriService } from './walisantri.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KoperasiModule } from '../koperasi/koperasi.module';

@Module({
  imports: [PrismaModule, KoperasiModule],
  controllers: [WalisantriController],
  providers: [WalisantriService],
})
export class WalisantriModule {}
