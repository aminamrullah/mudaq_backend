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

  @Get('tenant')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Wallet (Saldo Induk)' })
  getTenantWallet(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getTenantWallet(t);
  }

  @Post('tenant/topup')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Top up Tenant Wallet by Superadmin' })
  topupTenantWallet(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { target_tenant_uuid?: string; amount: number; description?: string },
  ) {
    const targetUuid = dto.target_tenant_uuid || t;
    return this.svc.topupTenantWallet(targetUuid, dto);
  }

  @Post('tenant/withdraw')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Withdraw Tenant Wallet by Superadmin' })
  withdrawTenantWallet(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { target_tenant_uuid?: string; amount: number; description?: string },
  ) {
    const targetUuid = dto.target_tenant_uuid || t;
    return this.svc.withdrawTenantWallet(targetUuid, dto);
  }

  @Post('tenant/topup-request')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Request Manual Topup Tenant Wallet' })
  createTenantTopupRequest(@CurrentUser('tenant_uuid') t: string, @Body() dto: { amount: number; proof_url?: string }) {
    return this.svc.createTenantTopupRequest(t, dto.amount, dto.proof_url);
  }

  @Get('tenant/my-topup-requests')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get My Tenant Topup Requests' })
  getTenantMyTopupRequests(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getTenantMyTopupRequests(t);
  }

  @Get('tenant/topup-requests')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get All Tenant Topup Requests' })
  getTenantTopupRequests(@Query('status') status?: string) {
    return this.svc.getTenantTopupRequests({ status });
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

  @Get('tenant/transactions')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get Tenant Wallet Transactions History' })
  getTenantWalletTransactions(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getTenantWalletTransactions(t);
  }

  @Post('tenant/withdraw-request')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Request withdrawal of Tenant Wallet' })
  requestTenantWithdrawal(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { amount: number; bank_name: string; account_no: string; account_name: string; notes?: string },
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

  @Post('tenant/withdraw-requests/:id/approve')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or Reject Tenant Withdrawal Request' })
  approveTenantWithdrawalRequest(
    @Param('id') id: string,
    @Body() dto: { is_approved: boolean },
  ) {
    return this.svc.approveTenantWithdrawalRequest(id, dto.is_approved);
  }

  @Get('tenant/topup-requests/:id/invoice')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'View Topup Request Invoice HTML' })
  async downloadTopupInvoice(@Param('id') id: string, @Res() res: Response) {
    const html = await this.svc.generateTopupInvoiceHtml(id);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
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

