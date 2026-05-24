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
import { MailService } from '../mail/mail.service';
import PDFDocument = require('pdfkit');

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mailService: MailService,
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
    const walletWhere: any = {
      tenant_uuid: tenantUuid,
      student: { deleted_at: null }
    };
    if (parentPhone) {
      walletWhere.student.parent_phone = parentPhone;
    }

    const wallets = await this.prisma.wallet.findMany({
      where: walletWhere,
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
        where: {
          tenant_uuid: tenantUuid,
          student: { deleted_at: null }
        },
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
      where: {
        id: walletId,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      },
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
      select: { manual_topup_fee: true, min_tenant_wallet_balance: true },
    });

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      },
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

      const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);
      if (Number(tenantWallet.balance) - Number(amount) < minBalance) {
        throw new BadRequestException(
          'Saldo Induk Pesantren tidak mencukupi untuk top up ini (Terpotong Saldo Mengendap).'
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
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      },
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
    const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
    const isDemo = xenditKey.startsWith('xnd_development_');

    if (isDemo) {
      this.logger.log(`[DEMO MODE] Auto-paying topup for wallet ${dto.wallet_id}`);
      return await this.prisma.$transaction(async (tx) => {
        const topupLog = await tx.topupLog.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: dto.wallet_id,
            external_id: externalId,
            xendit_id: `demo_${Date.now()}`,
            amount: new Prisma.Decimal(dto.amount),
            notes: 'Demo Auto Payment',
            platform_fee: 0,
            surcharge_fee: 0,
            status: 'success',
            paid_at: new Date(),
            net_amount: new Prisma.Decimal(dto.amount),
          },
        });

        const balanceBefore = Number(wallet.balance);
        const balanceAfter = balanceBefore + Number(dto.amount);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: new Prisma.Decimal(balanceAfter) },
        });

        await tx.walletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: wallet.id,
            type: 'deposit',
            amount: new Prisma.Decimal(dto.amount),
            balance_before: new Prisma.Decimal(balanceBefore),
            balance_after: new Prisma.Decimal(balanceAfter),
            reference: externalId,
            description: `Top Up e-Wallet via Demo Payment Gateway`,
          },
        });

        return { 
          external_id: externalId,
          amount: dto.amount,
          status: 'PAID',
          demo_mode: true
        };
      });
    }

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
          const successUrl = this.config.get<string>('XENDIT_SUCCESS_URL');
          const failureUrl = this.config.get<string>('XENDIT_FAILURE_URL');

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
              success_redirect_url: successUrl,
              failure_redirect_url: failureUrl,
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
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      },
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

  async verifyPin(tenantUuid: string, walletId: string, pin: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        id: walletId,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      }
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');
    if (!wallet.pin) throw new BadRequestException('PIN belum diatur');
    
    const isValid = await bcrypt.compare(pin, wallet.pin);
    if (!isValid) throw new BadRequestException('PIN tidak sesuai');
    return true;
  }

  async withdraw(tenantUuid: string, dto: { wallet_id: string; amount: number; pin: string; notes?: string }) {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        id: dto.wallet_id,
        tenant_uuid: tenantUuid,
        student: { deleted_at: null }
      },
    });
    if (!wallet) throw new NotFoundException('Dompet tidak ditemukan');
    
    // Security check: verify student PIN
    await this.verifyPin(tenantUuid, wallet.id, dto.pin);
    
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
        where: {
          id: dto.from_wallet_id,
          tenant_uuid: tenantUuid,
          student: { deleted_at: null }
        },
        include: { student: { select: { name: true } } },
      }),
      this.prisma.wallet.findFirst({
        where: {
          id: dto.to_wallet_id,
          tenant_uuid: tenantUuid,
          student: { deleted_at: null }
        },
        include: { student: { select: { name: true } } },
      }),
    ]);
    if (!from || !to) {
      this.logger.warn(`[TRANSFER] Wallet not found. From: ${!!from}, To: ${!!to}`);
      throw new NotFoundException('Dompet tidak ditemukan');
    }
    if (Number(from.balance) < dto.amount)
      throw new BadRequestException('Saldo tidak mencukupi');

    await this.verifyPin(tenantUuid, dto.from_wallet_id, dto.pin);

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
      const pesantren = await tx.pesantren.findUnique({ where: { id: tenantUuid } });
      const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

      if (!wallet || Number(wallet.balance) - Number(amount) < minBalance) {
        throw new BadRequestException('Saldo Induk tidak mencukupi (termasuk minimal saldo mengendap)');
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

  async createTenantTopupRequest(tenantUuid: string, amount: number, proof_url?: string) {
    if (amount <= 0) throw new BadRequestException('Jumlah top up tidak valid');

    const pesantren = await this.prisma.pesantren.findUnique({ where: { id: tenantUuid } });
    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    const request = await this.prisma.tenantTopupRequest.create({
      data: {
        tenant_uuid: tenantUuid,
        amount,
        proof_url,
        status: 'pending',
      },
    });

    return {
      message: 'Permintaan top up berhasil dibuat, menunggu persetujuan Superadmin.',
      request,
    };
  }

  async getTenantMyTopupRequests(tenantUuid: string) {
    return this.prisma.tenantTopupRequest.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
    });
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
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: 'Topup Saldo Induk disetujui',
          reference: request.id,
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

  async createTenantWithdrawalRequest(tenantUuid: string, dto: { amount: number; bank_name: string; account_no: string; account_name: string; notes?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const pesantren = await tx.pesantren.findUnique({ where: { id: tenantUuid } });
      
      if (pesantren?.subscription_status !== 'active') {
        throw new BadRequestException('Penarikan dana Saldo Induk hanya bisa dilakukan jika status pesantren AKTIF.');
      }

      const wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } });
      const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

      if (!wallet || Number(wallet.balance) - Number(dto.amount) < minBalance) {
        throw new BadRequestException(`Saldo Induk tidak mencukupi (termasuk minimal saldo mengendap Rp${minBalance})`);
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.sub(balanceBefore, dto.amount);

      await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      const request = await tx.tenantWithdrawalRequest.create({
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

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'withdraw_to_superadmin',
          amount: dto.amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: request.id,
          description: dto.notes || 'Penarikan Dana (Withdraw) Menunggu Persetujuan',
        },
      });

      return { message: 'Permintaan penarikan berhasil dibuat dan saldo ditahan', request };
    });
  }

  async approveTenantWithdrawalRequest(requestId: string, isApproved: boolean) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantWithdrawalRequest.findUnique({ 
        where: { id: requestId },
        include: { pesantren: true }
      });
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
              reference: `REF-WD-${request.id.slice(0,8)}`,
              description: `Pengembalian dana dari Request Penarikan Ditolak`,
            },
          });
        }
      }
      return { request, message: isApproved ? 'Request disetujui' : 'Request ditolak (dana dikembalikan)' };
    });

    if (isApproved && result.request.pesantren?.email) {
      try {
        const amountFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(result.request.amount));
        const dateStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        const subject = `Invoice Pencairan Dana - ${result.request.pesantren.name}`;
        const html = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>Invoice / Bukti Pencairan Dana</h2>
            <p>Halo <strong>${result.request.pesantren.name}</strong>,</p>
            <p>Permintaan pencairan dana (withdrawal) Anda telah <strong>disetujui</strong> dan diproses oleh Superadmin MUDAQ.</p>
            <table style="width: 100%; max-width: 600px; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">ID Transaksi</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${result.request.id}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Tanggal</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Bank Tujuan</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${result.request.bank_name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">No. Rekening</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${result.request.account_no}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Atas Nama</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${result.request.account_name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 16px;">Nominal Pencairan</td>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #10b981;">${amountFormatted}</td>
              </tr>
            </table>
            <p>Dana akan segera masuk ke rekening tujuan Anda sesuai dengan estimasi waktu dari pihak bank.</p>
            <p>Terima kasih telah menggunakan layanan MUDAQ.</p>
            <br/>
            <p>Salam,</p>
            <p><strong>Tim MUDAQ</strong></p>
          </div>
        `;
        this.mailService.sendMail(result.request.pesantren.email, subject, html).catch(e => {
          this.logger.error('Failed to send withdrawal invoice email', e);
        });
      } catch (e) {
        this.logger.error('Failed to prepare withdrawal invoice email', e);
      }
    }

    return { message: result.message };
  }

  async generateTopupInvoiceHtml(id: string): Promise<string> {
    const req = await this.prisma.tenantTopupRequest.findUnique({ where: { id }, include: { pesantren: true } });
    if (!req) throw new NotFoundException('Request tidak ditemukan');
    if (req.status !== 'approved') throw new BadRequestException('Hanya request yang disetujui yang memiliki invoice');

    const amount = Number(req.amount).toLocaleString('id-ID');
    const date = new Date(req.created_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const time = new Date(req.created_at).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <title>Invoice Top Up Saldo Induk - ${req.id}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 20px; background: #f9f9f9; }
              .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); border-radius: 8px; }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8b5cf6; padding-bottom: 20px; margin-bottom: 20px; }
              .logo-container { display: flex; align-items: center; gap: 15px; }
              .logo { width: 60px; height: 60px; object-fit: contain; }
              .pesantren-info h2 { margin: 0; color: #4c1d95; font-size: 20px; }
              .pesantren-info p { margin: 2px 0; font-size: 13px; color: #666; }
              .invoice-info { text-align: right; }
              .invoice-info h1 { margin: 0; font-size: 24px; color: #8b5cf6; text-transform: uppercase; letter-spacing: 2px; }
              .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
              .detail-item { display: flex; flex-direction: column; }
              .detail-label { font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; }
              .detail-value { font-size: 15px; font-weight: 600; color: #1e293b; }
              table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; margin-top: 10px; }
              table th { background: #f1f5f9; padding: 12px; border-bottom: 2px solid #cbd5e1; color: #334155; }
              table td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
              .total-row { background: #f8fafc; font-weight: bold; font-size: 16px; }
              .total-row td { border-top: 2px solid #cbd5e1; border-bottom: none; }
              .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
              .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 13px; background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
              @media print {
                  body { background: none; padding: 0; }
                  .invoice-box { box-shadow: none; border: none; padding: 10px; }
                  .no-print { display: none; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="text-align: center; margin-bottom: 20px;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #8b5cf6; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Cetak Invoice / Simpan PDF</button>
          </div>
          <div class="invoice-box">
              <div class="header">
                  <div class="logo-container">
                      ${req.pesantren?.logo ? `<img src="${req.pesantren.logo}" class="logo" alt="Logo" />` : ''}
                      <div class="pesantren-info">
                          <h2>${req.pesantren?.name || 'Pesantren'}</h2>
                          <p>${req.pesantren?.address || ''}</p>
                          <p>${req.pesantren?.phone ? 'Telp: ' + req.pesantren.phone : ''}</p>
                      </div>
                  </div>
                  <div class="invoice-info">
                      <h1>Invoice</h1>
                      <div style="font-weight: 600; margin-top: 5px;">ID: ${req.id.slice(0, 8).toUpperCase()}</div>
                      <div class="status-badge" style="margin-top: 8px;">DISETUJUI</div>
                  </div>
              </div>

              <div class="details-grid">
                  <div class="detail-item">
                      <span class="detail-label">Tanggal Top Up</span>
                      <span class="detail-value">${date} ${time}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Jenis Transaksi</span>
                      <span class="detail-value">Top Up Saldo Induk Pesantren</span>
                  </div>
              </div>

              <table>
                  <thead>
                      <tr>
                          <th>Deskripsi Transaksi</th>
                          <th style="text-align: right;">Jumlah</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td>
                              <div style="font-weight: 600; color: #1e293b;">Penambahan Saldo Induk</div>
                          </td>
                          <td style="text-align: right; vertical-align: top; font-weight: 500;">Rp ${amount}</td>
                      </tr>
                      <tr class="total-row">
                          <td style="text-align: right;">Total Top Up</td>
                          <td style="text-align: right; color: #8b5cf6;">Rp ${amount}</td>
                      </tr>
                  </tbody>
              </table>

              <div class="footer">
                  <p>Ini adalah bukti sah transaksi Top Up Saldo Induk Pesantren yang diterbitkan oleh sistem MUDAQ.</p>
                  <p>&copy; ${new Date().getFullYear()} MUDAQ Management System</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  async generateWithdrawInvoiceHtml(id: string): Promise<string> {
    const req = await this.prisma.tenantWithdrawalRequest.findUnique({ where: { id }, include: { pesantren: true } });
    if (!req) throw new NotFoundException('Request tidak ditemukan');
    if (req.status !== 'approved') throw new BadRequestException('Hanya request yang disetujui yang memiliki bukti pencairan');

    const amount = Number(req.amount).toLocaleString('id-ID');
    const date = new Date(req.updated_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const time = new Date(req.updated_at).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <title>Bukti Pencairan Dana - ${req.id}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 20px; background: #f9f9f9; }
              .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); border-radius: 8px; }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8b5cf6; padding-bottom: 20px; margin-bottom: 20px; }
              .logo-container { display: flex; align-items: center; gap: 15px; }
              .logo { width: 60px; height: 60px; object-fit: contain; }
              .pesantren-info h2 { margin: 0; color: #4c1d95; font-size: 20px; }
              .pesantren-info p { margin: 2px 0; font-size: 13px; color: #666; }
              .invoice-info { text-align: right; }
              .invoice-info h1 { margin: 0; font-size: 24px; color: #8b5cf6; text-transform: uppercase; letter-spacing: 2px; }
              .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
              .detail-item { display: flex; flex-direction: column; }
              .detail-label { font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; }
              .detail-value { font-size: 15px; font-weight: 600; color: #1e293b; }
              table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; margin-top: 10px; }
              table th { background: #f1f5f9; padding: 12px; border-bottom: 2px solid #cbd5e1; color: #334155; }
              table td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
              .total-row { background: #f8fafc; font-weight: bold; font-size: 16px; }
              .total-row td { border-top: 2px solid #cbd5e1; border-bottom: none; }
              .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
              .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 13px; background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
              @media print {
                  body { background: none; padding: 0; }
                  .invoice-box { box-shadow: none; border: none; padding: 10px; }
                  .no-print { display: none; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="text-align: center; margin-bottom: 20px;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #8b5cf6; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Cetak Bukti / Simpan PDF</button>
          </div>
          <div class="invoice-box">
              <div class="header">
                  <div class="logo-container">
                      ${req.pesantren?.logo ? `<img src="${req.pesantren.logo}" class="logo" alt="Logo" />` : ''}
                      <div class="pesantren-info">
                          <h2>${req.pesantren?.name || 'Pesantren'}</h2>
                          <p>${req.pesantren?.address || ''}</p>
                          <p>${req.pesantren?.phone ? 'Telp: ' + req.pesantren.phone : ''}</p>
                      </div>
                  </div>
                  <div class="invoice-info">
                      <h1>Bukti Dana</h1>
                      <div style="font-weight: 600; margin-top: 5px;">ID: ${req.id.slice(0, 8).toUpperCase()}</div>
                      <div class="status-badge" style="margin-top: 8px;">CAIR</div>
                  </div>
              </div>

              <div class="details-grid">
                  <div class="detail-item">
                      <span class="detail-label">Tanggal Pencairan</span>
                      <span class="detail-value">${date} ${time}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Jenis Transaksi</span>
                      <span class="detail-value">Tarik Dana (Withdrawal)</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Bank Tujuan</span>
                      <span class="detail-value">${req.bank_name}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Rekening / Atas Nama</span>
                      <span class="detail-value">${req.account_no} / ${req.account_name}</span>
                  </div>
              </div>

              <table>
                  <thead>
                      <tr>
                          <th>Deskripsi Transaksi</th>
                          <th style="text-align: right;">Jumlah</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td>
                              <div style="font-weight: 600; color: #1e293b;">Pencairan Saldo Induk ke Rekening Bank</div>
                          </td>
                          <td style="text-align: right; vertical-align: top; font-weight: 500;">Rp ${amount}</td>
                      </tr>
                      <tr class="total-row">
                          <td style="text-align: right;">Total Dicairkan</td>
                          <td style="text-align: right; color: #8b5cf6;">Rp ${amount}</td>
                      </tr>
                  </tbody>
              </table>

              <div class="footer">
                  <p>Ini adalah bukti sah transaksi Pencairan Saldo Induk Pesantren yang diterbitkan oleh sistem MUDAQ.</p>
                  <p>&copy; ${new Date().getFullYear()} MUDAQ Management System</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }
  async getTenantWalletTransactions(tenantUuid: string) {
    return this.prisma.tenantWalletTransaction.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }
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
  }
}
