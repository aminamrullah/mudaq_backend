import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UploadController],
})
export class UploadModule {}
