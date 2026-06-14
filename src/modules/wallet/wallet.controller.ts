import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  @ApiOperation({ summary: 'Cash top-up received by tenant' })
  topupManual(@CurrentUser('tenant_uuid') t: string, @Body() dto: TopupDto) {
    return this.svc.createManualTopup(t, dto);
  }

  @Post('distribute')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Distribute tenant float to a user wallet' })
  distribute(@CurrentUser('tenant_uuid') t: string, @Body() dto: TopupDto) {
    return this.svc.distributeTenantWalletToUser(t, dto);
  }

  @Post('withdraw')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Cash withdrawal paid by tenant' })
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

  @Get('tenant')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Wallet (Saldo Induk)' })
  getTenantWallet(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getTenantWallet(t);
  }

  @Get('tenant/finance-summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get tenant gateway, internal wallet, and cash-book summary' })
  getTenantFinanceSummary(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @Query('target_tenant_uuid') targetTenantUuid?: string,
  ) {
    const tenantUuid = role === Role.SUPER_ADMIN && targetTenantUuid ? targetTenantUuid : t;
    return this.svc.getTenantFinanceSummary(tenantUuid);
  }



  @Get('tenant/transactions')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Wallet Transactions History' })
  getTenantWalletTransactions(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getTenantWalletTransactions(t);
  }

  @Post('tenant/withdraw-request')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Request withdrawal of tenant Xendit gateway funds' })
  requestTenantWithdrawal(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { amount: number; bank_channel_code?: string; bank_name: string; account_no: string; account_name: string; notes?: string },
  ) {
    return this.svc.createTenantWithdrawalRequest(t, dto);
  }

  @Get('tenant/withdraw-requests')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Withdrawal Requests' })
  getTenantWithdrawalRequests(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @Query('status') status?: string,
  ) {
    const targetUuid = role === Role.SUPER_ADMIN ? undefined : t;
    return this.svc.getTenantWithdrawalRequests(targetUuid, status);
  }

  @Post('tenant/topup')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Topup tenant operational wallet manually' })
  topupTenantWallet(
    @Body() dto: { target_tenant_uuid: string; amount: number; description?: string }
  ) {
    return this.svc.topupTenantWallet(dto.target_tenant_uuid, { amount: dto.amount, description: dto.description });
  }

  @Post('tenant/withdraw')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Withdraw tenant operational wallet manually' })
  withdrawTenantWallet(
    @Body() dto: { target_tenant_uuid: string; amount: number; description?: string }
  ) {
    return this.svc.withdrawTenantWallet(dto.target_tenant_uuid, { amount: dto.amount, description: dto.description });
  }

  @Get('tenant/topup-requests')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Topup Requests' })
  getTenantTopupRequests(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('role') role: string,
    @Query('status') status?: string,
  ) {
    const targetUuid = role === Role.SUPER_ADMIN ? undefined : t;
    return this.svc.getTenantTopupRequests(targetUuid, status);
  }

  @Post('tenant/topup-requests/:id/approve')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or Reject Tenant Topup Request' })
  approveTenantTopupRequest(
    @Param('id') id: string,
    @Body() dto: { is_approved: boolean },
  ) {
    return this.svc.approveTenantTopupRequest(id, dto.is_approved);
  }

  @Post('tenant/withdraw-requests/:id/approve')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or Reject Tenant Withdrawal Request' })
  approveTenantWithdrawalRequest(
    @Param('id') id: string,
    @Body() dto: { is_approved: boolean },
  ) {
    return this.svc.approveTenantWithdrawalRequest(id, dto.is_approved);
  }



  @Get('tenant/withdraw-requests/:id/invoice')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'View Withdrawal Request Invoice HTML' })
  async downloadWithdrawInvoice(@Param('id') id: string, @Res() res: Response) {
    const html = await this.svc.generateWithdrawInvoiceHtml(id);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
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
}
