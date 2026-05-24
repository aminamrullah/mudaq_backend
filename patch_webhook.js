const fs = require('fs');
const file = 'c:/Users/A/Documents/mudaq/backend/src/modules/tenant/webhook.controller.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /if \(externalId\.startsWith\('TOPUP-'\)\) \{/,
  `if (externalId.startsWith('TENANT-TOPUP-')) {
        await this.handleTenantTopupPaid(externalId, body);
      } else if (externalId.startsWith('TOPUP-')) {`
);

const newMethod = `
  private async handleTenantTopupPaid(externalId: string, body: any) {
    const topup = await this.prisma.tenantTopupLog.findUnique({
      where: { external_id: externalId },
    });

    if (!topup || topup.status === 'success') {
      this.logger.log(\`Tenant Topup \${externalId} not found or already processed\`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const grossAmount = Number(body.amount || body.paid_amount || 0);
      
      // Xendit MDR Estimation
      let xenditFee = 0;
      if (topup.notes?.includes('QRIS')) {
        xenditFee = Math.round(grossAmount * 0.007 * 1.11);
      } else {
        xenditFee = 4500 * 1.11;
      }
      
      const netAmount = Math.max(0, grossAmount - xenditFee);

      await tx.tenantTopupLog.update({
        where: { id: topup.id },
        data: {
          status: 'success',
          paid_at: new Date(body.paid_at || new Date()),
          xendit_fee: new Prisma.Decimal(xenditFee),
          net_amount: new Prisma.Decimal(netAmount),
          amount: new Prisma.Decimal(grossAmount),
        },
      });

      let wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: topup.tenant_uuid } });
      if (!wallet) wallet = await tx.tenantWallet.create({ data: { tenant_uuid: topup.tenant_uuid, balance: 0 } });

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, new Prisma.Decimal(grossAmount));

      await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: topup.tenant_uuid,
          type: 'deposit_from_superadmin', // Treating this as a topup (system recognized deposit)
          amount: new Prisma.Decimal(grossAmount),
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: externalId,
          description: \`Top Up Saldo Induk Pesantren via Payment Gateway\`,
        },
      });
    });
    this.logger.log(\`Successfully processed Tenant Topup \${externalId}\`);
  }
`;

const lastBraceIndex = code.lastIndexOf('}');
code = code.substring(0, lastBraceIndex) + newMethod + code.substring(lastBraceIndex);

fs.writeFileSync(file, code);
