import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('xendit')
  @HttpCode(200)
  async handleXenditWebhook(
    @Headers('x-callback-token') token: string,
    @Body() body: any,
  ) {
    this.logger.log(`Webhook headers: ${JSON.stringify(token)}`);
    this.logger.log(`Webhook body received: ${JSON.stringify(body)}`);
    const xenditToken = this.config.get<string>('XENDIT_WEBHOOK_TOKEN');
    if (xenditToken && token !== xenditToken) {
      this.logger.warn('Invalid Xendit callback token');
      return { success: false, message: 'Invalid token' };
    }

    // Xendit QRIS uses reference_id, others use external_id
    const externalId = body.external_id || body.reference_id || (body.qr_code && body.qr_code.reference_id);
    
    if (!externalId) {
      this.logger.warn('No external_id or reference_id found in webhook body');
      return { success: true }; // Return 200 to Xendit but log warning
    }

    this.logger.log(`Received Xendit Webhook for ${externalId}`);
    
    // Status depends on method: 'PAID' for invoices, 'COMPLETED' for QRIS.
    // For VA, the payment callback has 'amount' and 'external_id' and usually 'transaction_id' (Xendit's)
    const isSuccess = body.status === 'PAID' || body.status === 'COMPLETED' || (!!body.amount && !!body.external_id && !body.bank_code); 
    // Note: VA creation callbacks have 'bank_code' and 'account_number' but no payment date/status.
    // VA payment callbacks have 'amount', 'external_id' and 'payment_id'.

    if (isSuccess) {

      if (externalId.startsWith('TOPUP-')) {
        await this.handleTopupPaid(externalId, body);
      } else if (externalId.startsWith('PAY-')) {
        await this.handleBillPaymentPaid(externalId, body);
      } else if (externalId.startsWith('DON-')) {
        await this.handleDonationPaid(externalId, body);
      }
    }

    return { success: true };
  }

  private async handleTopupPaid(externalId: string, body: any) {
    const topup = await this.prisma.topupLog.findUnique({
      where: { external_id: externalId },
      include: { wallet: { include: { student: true } } },
    });

    if (!topup || topup.status === 'success') {
      this.logger.log(`Topup ${externalId} not found or already processed`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Calculate Fees
      const surcharge = Number(topup.surcharge_fee || 0);
      const platformFee = Number(topup.platform_fee || 0);
      const grossAmount = Number(body.amount || body.paid_amount || 0);
      
      // Xendit MDR Estimation (Xendit doesn't send their fee in webhook)
      let xenditFee = 0;
      if (topup.notes?.includes('QRIS')) {
        xenditFee = Math.round(grossAmount * 0.007 * 1.11); // 0.7% + PPN 11%
      } else {
        xenditFee = 4500 * 1.11; // VA approx 4500 + PPN 11%
      }
      
      // The net income for pesantren is gross - platformFee - xenditFee
      // Note: Surcharge is part of gross, so we do not subtract it again.
      const netAmount = Math.max(0, grossAmount - platformFee - xenditFee);
      const walletAmount = grossAmount - surcharge;

      // 1. Update TopupLog status
      await tx.topupLog.update({
        where: { id: topup.id },
        data: {
          status: 'success',
          paid_at: new Date(body.paid_at || new Date()),
          xendit_fee: new Prisma.Decimal(xenditFee),
          net_amount: new Prisma.Decimal(netAmount),
          // Use walletAmount (gross - surcharge) to match the actual topup amount
          amount: new Prisma.Decimal(walletAmount),
        },
      });

      // 2. Increase Wallet Balance
      const balanceBefore = Number(topup.wallet.balance);
      const balanceAfter = balanceBefore + walletAmount;

      await tx.wallet.update({
        where: { id: topup.wallet_id },
        data: { balance: new Prisma.Decimal(balanceAfter) },
      });

      // 3. Create WalletTransaction
      await tx.walletTransaction.create({
        data: {
          tenant_uuid: topup.tenant_uuid,
          wallet_id: topup.wallet_id,
          type: 'deposit',
          amount: new Prisma.Decimal(walletAmount),
          balance_before: new Prisma.Decimal(balanceBefore),
          balance_after: new Prisma.Decimal(balanceAfter),
          reference: externalId,
          description: `Top Up e-Wallet via ${body.payment_method || 'Payment Gateway'}`,
        },
      });

      // 4. Send Notification if Parent Phone exists
      if (topup.wallet.student.parent_phone) {
        const user = await tx.user.findFirst({
          where: { phone: topup.wallet.student.parent_phone },
        });
        if (user) {
          await tx.userNotification.create({
            data: {
              user_id: user.id,
              type: 'WALLET',
              title: 'Top Up Berhasil',
              message: `Top up saldo sebesar Rp${walletAmount} untuk ananda ${topup.wallet.student.name} berhasil.`,
              action_data: { wallet_id: topup.wallet_id },
            },
          });
        }
      }
    });
    this.logger.log(`Successfully processed Topup ${externalId}`);
  }

  private async handleBillPaymentPaid(externalId: string, body: any) {
    let transactions: any[] = [];

    if (externalId.startsWith('PAY-BULK-')) {
      transactions = await this.prisma.transaction.findMany({
        where: { xendit_invoice_id: body.id },
        include: { bill: { include: { fee_category: true, student: true } } },
      });
    } else {
      const singleTx = await this.prisma.transaction.findUnique({
        where: { reference_no: externalId },
        include: { bill: { include: { fee_category: true, student: true } } },
      });
      if (singleTx) transactions = [singleTx];
    }

    if (transactions.length === 0) {
      this.logger.log(`No pending bill transactions found for ${externalId} / invoice ${body.id}`);
      return;
    }

    for (const transaction of transactions) {
      if (!transaction.bill || transaction.status === 'success') continue;
      const bill = transaction.bill;

      await this.prisma.$transaction(async (tx) => {
        const surcharge = Number(transaction.surcharge_fee || 0);
        const platformFee = Number(transaction.platform_fee || 0);
        // For bulk payments, we use the transaction's own amount_paid (which was set during creation)
        // instead of the total body.amount (which is the sum of all bills)
        const billReductionAmount = Number(transaction.amount_paid); 
        
        // MDR estimation (just for logging/accounting)
        let xenditFee = 0;
        const channel = (body.payment_channel || transaction.payment_channel || '').toUpperCase();
        if (channel.includes('QRIS') || channel.includes('QR_CODE')) {
          xenditFee = Math.round(billReductionAmount * 0.007 * 1.11);
        } else {
          xenditFee = transactions.length > 1 ? (4500 * 1.11) / transactions.length : (4500 * 1.11);
        }
        
        const netAmount = Math.max(0, billReductionAmount - platformFee - xenditFee);
        const newPaid = Number(bill.amount_paid) + billReductionAmount;
        const newStatus = newPaid >= Number(bill.amount) ? 'paid' : 'partial';

        // 1. Update Bill
        await tx.bill.update({
          where: { id: bill.id },
          data: { amount_paid: new Prisma.Decimal(newPaid), status: newStatus },
        });

        // 2. Update Transaction
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'success',
            payment_method: body.payment_method || 'payment_gateway',
            payment_channel: body.payment_channel || 'Xendit',
            xendit_invoice_id: body.id,
            xendit_fee: new Prisma.Decimal(xenditFee),
            net_amount: new Prisma.Decimal(netAmount),
          },
        });

        // 3. Send Notification
        if (bill.student.parent_phone) {
          const user = await tx.user.findFirst({ where: { phone: bill.student.parent_phone } });
          if (user) {
            await tx.userNotification.create({
              data: {
                user_id: user.id,
                type: 'BILL',
                title: 'Pembayaran Tagihan Berhasil',
                message: `Pembayaran tagihan ${bill.fee_category.name} untuk ananda ${bill.student.name} sebesar Rp${billReductionAmount} telah berhasil.`,
                action_data: { bill_id: bill.id },
              },
            });
          }
        }
      });
    }
    this.logger.log(`Successfully processed Bill Payment ${externalId} (${transactions.length} bills)`);
  }

  private async handleDonationPaid(externalId: string, body: any) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { reference_no: externalId },
      include: { student: true, fee_category: true },
    });

    if (!transaction || transaction.status === 'success') {
      this.logger.log(`Donation transaction for ${externalId} not found or already success`);
      return;
    }

    const category = transaction.fee_category;
    const student = transaction.student;

    if (!category || !student) {
      this.logger.log(`Category or Student not found for donation ${externalId}`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const surcharge = Number(transaction.surcharge_fee || 0);
      const platformFee = Number(transaction.platform_fee || 0);
      const grossAmount = Number(body.amount || body.paid_amount || 0);
      
      // Xendit MDR Estimation
      let xenditFee = 0;
      const channel = (body.payment_channel || transaction.payment_channel || '').toUpperCase();
      if (channel.includes('QRIS') || channel.includes('QR_CODE')) {
        xenditFee = Math.round(grossAmount * 0.007 * 1.11);
      } else {
        xenditFee = 4500 * 1.11;
      }
      
      const netAmount = Math.max(0, grossAmount - platformFee - xenditFee);
      const donationBaseAmount = Math.max(0, grossAmount - surcharge); 

      // Update Transaction
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          // Use donationBaseAmount (gross - surcharge) to keep reports accurate to the intended donation amount
          amount_paid: new Prisma.Decimal(donationBaseAmount),
          payment_method: body.payment_method || 'payment_gateway',
          payment_channel: body.payment_channel || 'Xendit',
          xendit_invoice_id: body.id,
          status: 'success',
          platform_fee: new Prisma.Decimal(body.fees?.find((f: any) => f.type === 'PLATFORM_FEE')?.value || transaction.platform_fee || 0),
          xendit_fee: new Prisma.Decimal(xenditFee),
          net_amount: new Prisma.Decimal(netAmount),
        },
      });

      // Send Notification
      if (student.parent_phone) {
        const user = await tx.user.findFirst({
          where: { phone: student.parent_phone },
        });
        if (user) {
          await tx.userNotification.create({
            data: {
              user_id: user.id,
              type: 'BILL',
              title: 'Donasi Berhasil Diterima',
              message: `Jazakumullah khairan. Donasi ${category.name} atas nama ${student.name} sebesar Rp${donationBaseAmount} telah berhasil kami terima.`,
            },
          });
        }
      }
    });
    this.logger.log(`Successfully processed Donation ${externalId}`);
  }
}
