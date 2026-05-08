import { Module } from '@nestjs/common';
import { WalisantriController } from './walisantri.controller';
import { WalisantriService } from './walisantri.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WalisantriController],
  providers: [WalisantriService],
})
export class WalisantriModule {}
