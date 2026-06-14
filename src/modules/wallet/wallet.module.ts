import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { XenditService } from '../tenant/xendit.service';

@Module({ controllers: [WalletController], providers: [WalletService, XenditService] })
export class WalletModule {}
