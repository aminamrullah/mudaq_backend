const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/wallet/wallet.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /select: \{ manual_topup_fee: true \}/g,
  'select: { manual_topup_fee: true, min_tenant_wallet_balance: true }'
);

code = code.replace(
  /if \(Number\(tenantWallet\.balance\) < Number\(amount\)\) \{/,
  `const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);
      if (Number(tenantWallet.balance) - Number(amount) < minBalance) {`
);

code = code.replace(
  /throw new BadRequestException\(\s*'Saldo Induk Pesantren tidak mencukupi untuk top up ini. Silakan hubungi Administrator untuk restock Saldo Induk.'\s*\);/g,
  `throw new BadRequestException(
          'Saldo Induk Pesantren tidak mencukupi untuk top up ini (Terpotong Saldo Mengendap).'
        );`
);

code = code.replace(
  /async withdrawTenantWallet\(tenantUuid: string, dto: \{ amount: number; description\?: string \}?\) \{[\s\S]*?if \(!wallet \|\| Number\(wallet\.balance\) < Number\(amount\)\) \{[\s\S]*?throw new BadRequestException\('Saldo Induk tidak mencukupi'\);[\s\S]*?\}/,
  `async withdrawTenantWallet(tenantUuid: string, dto: { amount: number; description?: string }) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
      const pesantren = await tx.pesantren.findUnique({ where: { id: tenantUuid } });
      const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

      if (!wallet || Number(wallet.balance) - Number(amount) < minBalance) {
        throw new BadRequestException('Saldo Induk tidak mencukupi (termasuk minimal saldo mengendap)');
      }`
);

// Add new methods at the end of the class, before the last '}'
const newMethods = `
  async createTenantTopupXendit(tenantUuid: string, dto: { amount: number; payment_channel?: string }) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
    });
    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    const externalId = \`TENANT-TOPUP-\${uuidv4().slice(0, 8)}\`;
    const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
    const isDemo = xenditKey.startsWith('xnd_development_');

    if (isDemo) {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenantTopupLog.create({
          data: {
            tenant_uuid: tenantUuid,
            external_id: externalId,
            xendit_id: \`demo_\${Date.now()}\`,
            amount: new Prisma.Decimal(dto.amount),
            notes: 'Demo Auto Payment',
            platform_fee: 0,
            status: 'success',
            paid_at: new Date(),
            net_amount: new Prisma.Decimal(dto.amount),
          },
        });

        let wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
        if (!wallet) wallet = await tx.tenantWallet.create({ data: { tenant_uuid: tenantUuid, balance: 0 } });

        const balanceBefore = wallet.balance;
        const balanceAfter = Prisma.Decimal.add(balanceBefore, new Prisma.Decimal(dto.amount));

        await tx.tenantWallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });

        await tx.tenantWalletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            type: 'deposit_from_superadmin',
            amount: new Prisma.Decimal(dto.amount),
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reference: externalId,
            description: \`Top Up Saldo Induk (Demo)\`,
          },
        });
      });
      return { external_id: externalId, amount: dto.amount, status: 'PAID', demo_mode: true };
    }

    let paymentData: any;
    if (xenditKey) {
      const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
      const headers: any = {
        Authorization: \`Basic \${Buffer.from(xenditKey + ':').toString('base64')}\`,
        'Content-Type': 'application/json',
      };
      
      const successUrl = this.config.get<string>('XENDIT_SUCCESS_URL');
      const failureUrl = this.config.get<string>('XENDIT_FAILURE_URL');

      // Note: Tenant Topups go to the MAIN platform account, so we do NOT set for-user-id
      // because the Pesantren is paying the Platform to get digital balance.

      const resp = await fetch(\`\${baseUrl}/v2/invoices\`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          external_id: externalId,
          amount: dto.amount,
          description: \`Top Up Saldo Induk Pesantren - \${pesantren.name}\`,
          invoice_duration: 3600,
          currency: 'IDR',
          success_redirect_url: successUrl,
          failure_redirect_url: failureUrl,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new BadRequestException(\`Xendit Invoice Error: \${data.message || 'Error'}\`);
      
      paymentData = {
        type: 'INVOICE',
        id: data.id,
        invoice_url: data.invoice_url,
        amount: dto.amount,
        external_id: externalId,
      };
    } else {
       throw new BadRequestException('Xendit config missing');
    }

    await this.prisma.tenantTopupLog.create({
      data: {
        tenant_uuid: tenantUuid,
        external_id: externalId,
        xendit_id: paymentData.id,
        amount: new Prisma.Decimal(dto.amount),
      },
    });

    return { ...paymentData, external_id: externalId };
  }

  async createTenantWithdrawalRequest(tenantUuid: string, dto: { amount: number; bank_name: string; account_no: string; account_name: string; notes?: string }) {
    const pesantren = await this.prisma.pesantren.findUnique({ where: { id: tenantUuid } });
    const wallet = await this.prisma.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
    const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

    // Deduct immediately on request to lock the funds
    return this.prisma.$transaction(async (tx) => {
      let currentWallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
      if (!currentWallet || Number(currentWallet.balance) - Number(dto.amount) < minBalance) {
        throw new BadRequestException(\`Saldo Induk tidak mencukupi (termasuk minimal saldo mengendap Rp\${minBalance})\`);
      }

      const balanceBefore = currentWallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, new Prisma.Decimal(dto.amount));

      await tx.tenantWallet.update({
        where: { id: currentWallet.id },
        data: { balance: balanceAfter },
      });

      const request = await tx.tenantWithdrawalRequest.create({
        data: {
          tenant_uuid: tenantUuid,
          amount: new Prisma.Decimal(dto.amount),
          bank_name: dto.bank_name,
          account_no: dto.account_no,
          account_name: dto.account_name,
          notes: dto.notes,
          status: 'pending',
        },
      });

      // Log transaction as "pending withdrawal"
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'withdraw_to_superadmin',
          amount: new Prisma.Decimal(dto.amount),
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: \`REQ-WD-\${request.id.slice(0,8)}\`,
          description: \`Penahanan dana untuk Request Penarikan (Pending)\`,
        },
      });

      return request;
    });
  }

  async getTenantWithdrawalRequests(tenantUuid?: string, status?: string) {
    const where: any = {};
    if (tenantUuid) where.tenant_uuid = tenantUuid;
    if (status) where.status = status;

    return this.prisma.tenantWithdrawalRequest.findMany({
      where,
      include: { pesantren: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async approveTenantWithdrawalRequest(requestId: string, isApproved: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantWithdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundException('Request tidak ditemukan');
      if (request.status !== 'pending') throw new BadRequestException('Request sudah diproses');

      if (isApproved) {
        await tx.tenantWithdrawalRequest.update({
          where: { id: requestId },
          data: { status: 'approved' },
        });
        // Funds are already deducted, so we just return success
      } else {
        await tx.tenantWithdrawalRequest.update({
          where: { id: requestId },
          data: { status: 'rejected' },
        });

        // Refund the tenant wallet
        const wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: request.tenant_uuid } });
        if (wallet) {
          const balanceBefore = wallet.balance;
          const balanceAfter = Prisma.Decimal.add(balanceBefore, request.amount);
          
          await tx.tenantWallet.update({
            where: { id: wallet.id },
            data: { balance: balanceAfter },
          });

          await tx.tenantWalletTransaction.create({
            data: {
              tenant_uuid: request.tenant_uuid,
              type: 'deposit_from_superadmin',
              amount: request.amount,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              reference: \`REF-WD-\${request.id.slice(0,8)}\`,
              description: \`Pengembalian dana dari Request Penarikan Ditolak\`,
            },
          });
        }
      }
      return { message: isApproved ? 'Request disetujui' : 'Request ditolak (dana dikembalikan)' };
    });
  }
`;

const lastBraceIndex = code.lastIndexOf('}');
code = code.substring(0, lastBraceIndex) + newMethods + code.substring(lastBraceIndex);

fs.writeFileSync(file, code);
