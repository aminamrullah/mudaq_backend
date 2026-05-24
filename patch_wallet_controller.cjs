const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.controller.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove topup-mandiri
code = code.replace(/  @Post\('tenant\/topup-mandiri'\)[\s\S]*?(?=  @Post\('tenant\/withdraw-request'\))/, `  @Post('tenant/topup-request')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Request Manual Topup Tenant Wallet' })
  createTenantTopupRequest(@Req() req, @Body() dto: { amount: number }) {
    return this.svc.createTenantTopupRequest(req.user.tenantId, dto.amount);
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get Tenant Wallet Transactions History' })
  getTenantWalletTransactions(@Req() req) {
    return this.svc.getTenantWalletTransactions(req.user.tenantId);
  }

`);

fs.writeFileSync(file, code);
