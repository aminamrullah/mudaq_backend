import { Module } from '@nestjs/common';
import { KoperasiController } from './koperasi.controller';
import { KoperasiService } from './koperasi.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [KoperasiController],
  providers: [KoperasiService],
  exports: [KoperasiService],
})
export class KoperasiModule {}
