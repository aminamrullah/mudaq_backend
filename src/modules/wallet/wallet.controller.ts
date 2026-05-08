import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { TopupDto, TransferDto, UpdatePinDto } from './dto/wallet.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly svc: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallets' })
  getWallets(
    @CurrentUser('tenant_uuid') t: string,
    @Query('parent_phone') pp?: string,
  ) {
    return this.svc.getWallets(t, pp);
  }

  @Get(':walletId/transactions')
  @ApiOperation({ summary: 'Get wallet transactions' })
  getTransactions(
    @CurrentUser('tenant_uuid') t: string,
    @Param('walletId') wid: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
  ) {
    return this.svc.getTransactions(t, wid, p, l);
  }

  @Post('topup')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.FINANCE_PESANTREN,
    Role.WALI_SANTRI,
  )
  @ApiOperation({ summary: 'Create top-up via Xendit' })
  topup(@CurrentUser('tenant_uuid') t: string, @Body() dto: TopupDto) {
    return this.svc.createTopup(t, dto);
  }

  @Post('topup-manual')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Manual top-up by admin (Cash)' })
  topupManual(@CurrentUser('tenant_uuid') t: string, @Body() dto: TopupDto) {
    return this.svc.createManualTopup(t, dto);
  }

  @Post('withdraw')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Cash withdrawal by admin' })
  withdraw(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { wallet_id: string; amount: number; pin: string; notes?: string },
  ) {
    return this.svc.withdraw(t, dto);
  }

  @Post('transfer')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Transfer between wallets' })
  transfer(@CurrentUser('tenant_uuid') t: string, @Body() dto: TransferDto) {
    return this.svc.transfer(t, dto);
  }

  @Post('pin')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Update or set Wallet PIN' })
  updatePin(@CurrentUser('tenant_uuid') t: string, @Body() dto: UpdatePinDto) {
    return this.svc.updatePin(t, dto);
  }
}

