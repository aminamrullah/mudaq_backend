const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.service.ts';
let code = fs.readFileSync(file, 'utf8');

const getTenantWalletTransactions = `
  async getTenantWalletTransactions(tenantUuid: string) {
    return this.prisma.tenantWalletTransaction.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }`;

const getTenantWithdrawalRequests = `
  async getTenantWithdrawalRequests(targetUuid?: string, status?: string) {
    const where: any = {};
    if (targetUuid) where.tenant_uuid = targetUuid;
    if (status) where.status = status;

    return this.prisma.tenantWithdrawalRequest.findMany({
      where,
      include: {
        pesantren: { select: { name: true, domain: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }`;

if (!code.includes('getTenantWalletTransactions(')) {
  code = code.replace(/\n\}\s*$/, getTenantWalletTransactions + '\n}\n');
}

if (!code.includes('getTenantWithdrawalRequests(')) {
  code = code.replace(/\n\}\s*$/, getTenantWithdrawalRequests + '\n}\n');
}

fs.writeFileSync(file, code);
