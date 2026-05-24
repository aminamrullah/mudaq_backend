const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.service.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove createTenantTopupXendit and replace with createTenantTopupRequest
code = code.replace(/  async createTenantTopupXendit[\s\S]*?(?=  async createTenantWithdrawalRequest)/, `  async createTenantTopupRequest(tenantUuid: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Jumlah top up tidak valid');

    const pesantren = await this.prisma.pesantren.findUnique({ where: { id: tenantUuid } });
    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    const request = await this.prisma.tenantTopupRequest.create({
      data: {
        tenant_uuid: tenantUuid,
        amount,
        status: 'pending',
      },
    });

    return {
      message: 'Permintaan top up berhasil dibuat, menunggu persetujuan Superadmin.',
      request,
    };
  }

  async approveTenantTopupRequest(requestId: string, isApproved: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantTopupRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) throw new NotFoundException('Permintaan top up tidak ditemukan');
      if (request.status !== 'pending') throw new BadRequestException('Permintaan ini sudah diproses');

      if (!isApproved) {
        return tx.tenantTopupRequest.update({
          where: { id: requestId },
          data: { status: 'rejected' },
        });
      }

      // If approved, add balance and log transaction
      const wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: request.tenant_uuid } });
      if (!wallet) throw new NotFoundException('Dompet induk pesantren tidak ditemukan');

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, request.amount);

      await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: request.tenant_uuid,
          type: 'deposit',
          amount: request.amount,
          balance_after: balanceAfter,
          description: 'Topup Saldo Induk disetujui',
          reference_id: request.id,
        },
      });

      return tx.tenantTopupRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });
    });
  }

  async getTenantTopupRequests(filters: { status?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;

    return this.prisma.tenantTopupRequest.findMany({
      where,
      include: {
        pesantren: { select: { name: true, domain: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

`);

// 2. Modify createTenantWithdrawalRequest (do NOT deduct balance here)
code = code.replace(/  async createTenantWithdrawalRequest[\s\S]*?(?=  async approveTenantWithdrawalRequest)/, `  async createTenantWithdrawalRequest(tenantUuid: string, dto: { amount: number; bank_name: string; account_no: string; account_name: string; notes?: string }) {
    const pesantren = await this.prisma.pesantren.findUnique({ where: { id: tenantUuid } });
    
    if (pesantren?.subscription_status !== 'active') {
      throw new BadRequestException('Penarikan dana Saldo Induk hanya bisa dilakukan jika status pesantren AKTIF.');
    }

    const wallet = await this.prisma.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
    const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

    if (!wallet || Number(wallet.balance) - Number(dto.amount) < minBalance) {
      throw new BadRequestException(\`Saldo Induk tidak mencukupi (termasuk minimal saldo mengendap Rp\${minBalance})\`);
    }

    const request = await this.prisma.tenantWithdrawalRequest.create({
      data: {
        tenant_uuid: tenantUuid,
        amount: dto.amount,
        bank_name: dto.bank_name,
        account_no: dto.account_no,
        account_name: dto.account_name,
        notes: dto.notes,
        status: 'pending',
      },
    });

    return { message: 'Permintaan penarikan berhasil dibuat', request };
  }

`);

// 3. Modify approveTenantWithdrawalRequest (deduct balance here)
code = code.replace(/  async approveTenantWithdrawalRequest[\s\S]*?(?=^\s*$)/, `  async approveTenantWithdrawalRequest(requestId: string, isApproved: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantWithdrawalRequest.findUnique({
        where: { id: requestId },
        include: { pesantren: true }
      });

      if (!request) throw new NotFoundException('Permintaan tidak ditemukan');
      if (request.status !== 'pending') throw new BadRequestException('Permintaan ini sudah diproses');

      if (!isApproved) {
        return tx.tenantWithdrawalRequest.update({
          where: { id: requestId },
          data: { status: 'rejected' },
        });
      }

      // Deduct balance
      const currentWallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: request.tenant_uuid } });
      const minBalance = Number(request.pesantren?.min_tenant_wallet_balance || 0);

      if (!currentWallet || Number(currentWallet.balance) - Number(request.amount) < minBalance) {
        throw new BadRequestException(\`Saldo Induk tidak mencukupi saat ini (termasuk minimal saldo mengendap Rp\${minBalance})\`);
      }

      const balanceBefore = currentWallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, request.amount);

      await tx.tenantWallet.update({
        where: { id: currentWallet.id },
        data: { balance: balanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: request.tenant_uuid,
          type: 'withdrawal',
          amount: request.amount,
          balance_after: balanceAfter,
          description: 'Penarikan Dana Saldo Induk',
          reference_id: request.id,
        },
      });

      return tx.tenantWithdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });
    });
  }

  async getTenantWalletTransactions(tenantUuid: string) {
    return this.prisma.tenantWalletTransaction.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }
}
`);

fs.writeFileSync(file, code);
