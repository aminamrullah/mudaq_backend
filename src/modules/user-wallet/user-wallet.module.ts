import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserWalletService } from './user-wallet.service';
import { UserWalletController } from './user-wallet.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [UserWalletService],
  controllers: [UserWalletController],
  exports: [UserWalletService],
})
export class UserWalletModule {}
