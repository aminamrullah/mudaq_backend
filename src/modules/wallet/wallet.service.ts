import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TopupDto, TransferDto, UpdatePinDto } from './dto/wallet.dto';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getWallets(tenantUuid: string, parentPhone?: string) {
    const where: any = { tenant_uuid: tenantUuid, deleted_at: null };
    if (parentPhone) where.parent_phone = parentPhone;
    
    // 1. Get all active students
    const students = await this.prisma.student.findMany({
      where,
      select: { id: true, name: true, nis: true, parent_phone: true },
    });

    // 2. Get existing wallets
    const wallets = await this.prisma.wallet.findMany({
      where: { tenant_uuid: tenantUuid },
      include: {
        student: {
          select: { id: true, name: true, nis: true, parent_phone: true },
        },
      },
    });

    // 3. Ensure all students have wallets
    const studentWithWalletIds = new Set(wallets.map(w => w.student_id));
    const missingWallets = students.filter(s => !studentWithWalletIds.has(s.id));

    if (missingWallets.length > 0) {
      await this.prisma.wallet.createMany({
        data: missingWallets.map(s => ({
          tenant_uuid: tenantUuid,
          student_id: s.id,
          balance: 0,
        })),
        skipDuplicates: true,
      });
      // Re-fetch wallets after creation
      return this.prisma.wallet.findMany({
        where: { tenant_uuid: tenantUuid },
        include: {
          student: {
            select: { id: true, name: true, nis: true, parent_phone: true },
          },
        },
        orderBy: { student: { name: 'asc' } },
      });
    }

    return wallets.sort((a, b) => (a.student?.name || '').localeCompare(b.student?.name || ''));
  }

  async getTransactions(
    tenantUuid: string,
    walletId: string,
    page = 1,
    limit = 20,
  ) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    const [data, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { wallet_id: walletId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where: { wallet_id: walletId } }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createManualTopup(tenantUuid: string, dto: TopupDto) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { manual_topup_fee: true },
    });

    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.wallet_id, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    const amount = new Prisma.Decimal(dto.amount);
    const adminFee = pesantren?.manual_topup_fee || new Prisma.Decimal(0);

    return this.prisma.$transaction(async (tx) => {
      // 1. Get and check Tenant Wallet
      let tenantWallet = await tx.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid },
      });
      if (!tenantWallet) {
        tenantWallet = await tx.tenantWallet.create({
          data: { tenant_uuid: tenantUuid, balance: 0 },
        });
      }

      if (Number(tenantWallet.balance) < Number(amount)) {
        throw new BadRequestException(
          'Saldo Induk Pesantren tidak mencukupi untuk top up ini. Silakan hubungi Administrator untuk restock Saldo Induk.'
        );
      }

      // 2. Deduct Tenant Wallet
      const tenantBalanceBefore = tenantWallet.balance;
      const tenantBalanceAfter = Prisma.Decimal.sub(tenantBalanceBefore, amount);
      await tx.tenantWallet.update({
        where: { id: tenantWallet.id },
        data: { balance: tenantBalanceAfter },
      });

      // 3. Record Tenant Wallet Transaction
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'student_topup',
          amount: amount,
          balance_before: tenantBalanceBefore,
          balance_after: tenantBalanceAfter,
          reference: `TOPUP-${Date.now()}`,
          description: `Top up manual ke dompet santri (Wallet ID: ${wallet.id})`,
        },
      });

      // 4. Update student wallet balance
      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, amount);
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // 5. Create student transaction record
      await tx.walletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: wallet.id,
          type: 'deposit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `MANUAL-${Date.now()}`,
          description: `Top up tunai oleh Admin (Biaya Admin: ${adminFee})`,
        },
      });

      return updated;
    });
  }

  async createTopup(tenantUuid: string, dto: TopupDto) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.wallet_id, tenant_uuid: tenantUuid },
      include: {
        student: {
          include: {
            pesantren: true
          }
        },
      },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    const externalId = `TOPUP-${dto.wallet_id.slice(0, 8)}-${uuidv4().slice(0, 8)}`;
    const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY');

    let paymentData: any;
    let surcharge = 0;
    let platformFeeAmount = 0;
    if (xenditKey) {
      const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
      const headers: any = {
        Authorization: `Basic ${Buffer.from(xenditKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      };
      // Strict Validation: Sub-account ID is MANDATORY for multi-tenant isolation
      const subAccountId = wallet.student.pesantren?.xendit_sub_account_id;
      if (!subAccountId) {
        throw new BadRequestException('Pesantren belum dikonfigurasi dengan akun pembayaran Xendit. Hubungi Administrator.');
      }

      if (/^[0-9a-fA-F]{24}$/.test(subAccountId)) {
        headers['for-user-id'] = subAccountId;
      } else {
        this.logger.error(`[XENDIT] Critical Config Error: Invalid sub_account_id format for wallet ${dto.wallet_id}: "${subAccountId}"`);
        throw new BadRequestException('ID Akun Pembayaran Pesantren tidak valid. Mohon periksa pengaturan pesantren.');
      }
       // Handle Direct VA
        const isVA = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'VA'].includes(dto.payment_channel || '');
        const isQRIS = dto.payment_channel === 'QRIS';

        if (isQRIS && wallet.student.pesantren?.qris_fee_is_percent) {
          const surchargePercent = Number(wallet.student.pesantren.qris_surcharge_fee || 0);
          const platformPercent = Number(wallet.student.pesantren.qris_platform_fee || 0);

          surcharge = Math.round(Number(dto.amount) * (surchargePercent / 100));
          const totalWithSurcharge = Number(dto.amount) + surcharge;
          
          const rawPlatformFeeAmount = Math.round(totalWithSurcharge * (platformPercent / 100));
          const estimatedXenditFee = Math.round(totalWithSurcharge * 0.007 * 1.11);
          platformFeeAmount = Math.max(0, rawPlatformFeeAmount - estimatedXenditFee);
        } else {
          surcharge = isQRIS ? Number(wallet.student.pesantren?.qris_surcharge_fee || 0) : Number(wallet.student.pesantren?.surcharge_fee || 0);
          const rawPlatformFeeAmount = isQRIS ? Number(wallet.student.pesantren?.qris_platform_fee || 0) : Number(wallet.student.pesantren?.platform_fee || 0);
          
          const estimatedXenditFee = isQRIS ? Math.round((Number(dto.amount) + surcharge) * 0.007 * 1.11) : Math.round(4500 * 1.11);
          platformFeeAmount = Math.max(0, rawPlatformFeeAmount - estimatedXenditFee);
        }

        const totalAmount = Number(dto.amount) + surcharge;

        const feeConfig = platformFeeAmount > 0 ? {
          fees: [{ type: 'PLATFORM_FEE', value: platformFeeAmount }]
        } : {};

        const isDirectVA = isVA && dto.payment_channel !== 'VA';

        if (isDirectVA) {
          const resp = await fetch(`${baseUrl}/callback_virtual_accounts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              external_id: externalId,
              bank_code: dto.payment_channel,
              name: wallet.student.name.substring(0, 50),
              expected_amount: totalAmount,
              is_closed: true,
              is_single_use: true,
              ...feeConfig,
            }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new BadRequestException(`Xendit VA Error: ${data.message || 'Error'}`);
          
          paymentData = {
            type: 'VA',
            id: data.id,
            bank_code: data.bank_code,
            account_number: data.account_number,
            amount: totalAmount,
            external_id: externalId,
          };
        } else {
          // General VA, QRIS, and everything else use Invoice for consistency
          const resp = await fetch(`${baseUrl}/v2/invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              external_id: externalId,
              amount: totalAmount,
              description: `Top Up E-Wallet - ${wallet.student.name}`,
              invoice_duration: 3600,
              currency: 'IDR',
              payment_methods: dto.payment_channel === 'VA' ? ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA'] : 
                               dto.payment_channel === 'QRIS' ? ['QRIS'] : 
                               dto.payment_channel ? [dto.payment_channel] : undefined,
              ...feeConfig,
            }),
          });
        const data = await resp.json();
        if (!resp.ok) throw new BadRequestException(`Xendit Invoice Error: ${data.message || 'Error'}`);
        
        paymentData = {
          type: 'INVOICE',
          id: data.id,
          invoice_url: data.invoice_url,
          amount: dto.amount,
          external_id: externalId,
        };
      }
    } else {
      // Demo Mock
      paymentData = {
        type: 'INVOICE',
        id: `demo_${Date.now()}`,
        invoice_url: `https://checkout.xendit.co/web/demo_${Date.now()}`,
        amount: dto.amount,
        external_id: externalId,
      };
    }

    await this.prisma.topupLog.create({
      data: {
        tenant_uuid: tenantUuid,
        wallet_id: dto.wallet_id,
        external_id: externalId,
        xendit_id: paymentData.id,
        amount: new Prisma.Decimal(dto.amount),
        notes: paymentData.type === 'VA' ? `VA: ${paymentData.account_number}` : paymentData.type === 'QRIS' ? 'QRIS Payment' : 'Invoice Payment',
        platform_fee: new Prisma.Decimal(platformFeeAmount),
        surcharge_fee: new Prisma.Decimal(surcharge),
      },
    });

    this.logger.log(`Topup created: ${externalId} for wallet ${dto.wallet_id} (${paymentData.type})`);
    return {
      ...paymentData,
      external_id: externalId,
    };
  }

  async updatePin(tenantUuid: string, dto: UpdatePinDto) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.wallet_id, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');

    if (wallet.pin && dto.old_pin) {
      const isValid = await bcrypt.compare(dto.old_pin, wallet.pin);
      if (!isValid) throw new BadRequestException('PIN lama tidak sesuai');
    } else if (wallet.pin && !dto.old_pin) {
      throw new BadRequestException('PIN lama diperlukan');
    }

    const hashedPin = await bcrypt.hash(dto.new_pin, 10);
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { pin: hashedPin },
    });
    return { message: 'PIN berhasil diubah' };
  }

  async verifyPin(walletId: string, pin: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');
    if (!wallet.pin) throw new BadRequestException('PIN belum diatur');
    
    const isValid = await bcrypt.compare(pin, wallet.pin);
    if (!isValid) throw new BadRequestException('PIN tidak sesuai');
    return true;
  }

  async withdraw(tenantUuid: string, dto: { wallet_id: string; amount: number; pin: string; notes?: string }) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: dto.wallet_id, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');
    
    // Security check: verify student PIN
    await this.verifyPin(wallet.id, dto.pin);
    
    if (Number(wallet.balance) < dto.amount) throw new BadRequestException('Saldo tidak mencukupi');

    const amount = new Prisma.Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      // 1. Get or Create Tenant Wallet
      let tenantWallet = await tx.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid },
      });
      if (!tenantWallet) {
        tenantWallet = await tx.tenantWallet.create({
          data: { tenant_uuid: tenantUuid, balance: 0 },
        });
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, amount);

      // 2. Update student wallet balance
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // 3. Create student transaction record
      await tx.walletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: wallet.id,
          type: 'withdraw',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `WD-${Date.now()}`,
          description: dto.notes || 'Tarik tunai oleh Admin',
        },
      });

      // 4. Add to Tenant Wallet
      const tenantBalanceBefore = tenantWallet.balance;
      const tenantBalanceAfter = Prisma.Decimal.add(tenantBalanceBefore, amount);
      await tx.tenantWallet.update({
        where: { id: tenantWallet.id },
        data: { balance: tenantBalanceAfter },
      });

      // 5. Record Tenant Wallet Transaction
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'student_withdraw',
          amount: amount,
          balance_before: tenantBalanceBefore,
          balance_after: tenantBalanceAfter,
          reference: `WD-${Date.now()}`,
          description: `Tarik tunai dari dompet santri (Wallet ID: ${wallet.id})`,
        },
      });

      return updated;
    });
  }

  async transfer(tenantUuid: string, dto: TransferDto) {
    this.logger.log(`[TRANSFER] Attempting transfer from ${dto.from_wallet_id} to ${dto.to_wallet_id}, amount: ${dto.amount}`);
    
    if (dto.from_wallet_id === dto.to_wallet_id)
      throw new BadRequestException('Tidak bisa transfer ke dompet yang sama');

    const [from, to] = await Promise.all([
      this.prisma.wallet.findFirst({
        where: { id: dto.from_wallet_id, tenant_uuid: tenantUuid },
        include: { student: { select: { name: true } } },
      }),
      this.prisma.wallet.findFirst({
        where: { id: dto.to_wallet_id, tenant_uuid: tenantUuid },
        include: { student: { select: { name: true } } },
      }),
    ]);
    if (!from || !to) {
      this.logger.warn(`[TRANSFER] Wallet not found. From: ${!!from}, To: ${!!to}`);
      throw new NotFoundException('Dompet tidak ditemukan');
    }
    if (Number(from.balance) < dto.amount)
      throw new BadRequestException('Saldo tidak mencukupi');

    await this.verifyPin(dto.from_wallet_id, dto.pin);

    const ref = `TRF-${Date.now()}`;
    const fromBefore = Number(from.balance);
    const toBefore = Number(to.balance);

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: from.id },
        data: { balance: { decrement: dto.amount } },
      }),
      this.prisma.wallet.update({
        where: { id: to.id },
        data: { balance: { increment: dto.amount } },
      }),
      this.prisma.walletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: from.id,
          type: 'transfer_out',
          amount: new Prisma.Decimal(dto.amount),
          balance_before: new Prisma.Decimal(fromBefore),
          balance_after: new Prisma.Decimal(fromBefore - dto.amount),
          reference: ref,
          description: `Transfer ke ${to.student.name}`,
        },
      }),
      this.prisma.walletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: to.id,
          type: 'transfer_in',
          amount: new Prisma.Decimal(dto.amount),
          balance_before: new Prisma.Decimal(toBefore),
          balance_after: new Prisma.Decimal(toBefore + dto.amount),
          reference: ref,
          description: `Terima dari ${from.student.name}`,
        },
      }),
    ]);

    return {
      message: 'Transfer berhasil',
      new_balance: fromBefore - dto.amount,
    };
  }

  async getTenantWallet(tenantUuid: string) {
    let wallet = await this.prisma.tenantWallet.findUnique({
      where: { tenant_uuid: tenantUuid },
    });
    if (!wallet) {
      wallet = await this.prisma.tenantWallet.create({
        data: { tenant_uuid: tenantUuid, balance: 0 },
      });
    }
    return wallet;
  }

  async topupTenantWallet(tenantUuid: string, dto: { amount: number; description?: string }) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      let wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
      if (!wallet) {
        wallet = await tx.tenantWallet.create({ data: { tenant_uuid: tenantUuid, balance: 0 } });
      }
      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, amount);

      const updated = await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'deposit_from_superadmin',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `SA-TOPUP-${Date.now()}`,
          description: dto.description || 'Top up Saldo Induk oleh Superadmin',
        },
      });
      return updated;
    });
  }

  async withdrawTenantWallet(tenantUuid: string, dto: { amount: number; description?: string }) {
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
      if (!wallet || Number(wallet.balance) < Number(amount)) {
        throw new BadRequestException('Saldo Induk tidak mencukupi');
      }
      
      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, amount);

      const updated = await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'withdraw_to_superadmin',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `SA-WD-${Date.now()}`,
          description: dto.description || 'Penarikan Saldo Induk oleh Superadmin',
        },
      });
      return updated;
    });
  }
}
