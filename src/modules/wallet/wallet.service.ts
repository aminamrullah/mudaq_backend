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
import { XenditService } from '../tenant/xendit.service';
import PDFDocument = require('pdfkit');

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mailService: MailService,
    private xenditService: XenditService,
  ) {}

  private resolveXenditBankChannel(bankName?: string, bankChannelCode?: string) {
    if (bankChannelCode) return bankChannelCode.toUpperCase();
    const normalized = (bankName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const map: Record<string, string> = {
      BCA: 'ID_BCA',
      BANKBCA: 'ID_BCA',
      BNI: 'ID_BNI',
      BANKBNI: 'ID_BNI',
      BRI: 'ID_BRI',
      BANKBRI: 'ID_BRI',
      MANDIRI: 'ID_MANDIRI',
      BANKMANDIRI: 'ID_MANDIRI',
      PERMATA: 'ID_PERMATA',
      BANKPERMATA: 'ID_PERMATA',
      CIMB: 'ID_CIMB',
      CIMBNIAGA: 'ID_CIMB',
      BANKCIMBNIAGA: 'ID_CIMB',
      BSI: 'ID_BSI',
      BANKBSI: 'ID_BSI',
      BTN: 'ID_BTN',
      BANKBTN: 'ID_BTN',
    };
    return map[normalized] || '';
  }

  private mapPayoutStatus(status?: string) {
    const normalized = (status || '').toUpperCase();
    if (['SUCCEEDED', 'COMPLETED', 'SUCCESS'].includes(normalized)) return 'succeeded';
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(normalized)) return 'failed';
    return 'processing';
  }

  // Helper to fetch current gateway (Xendit sub‑account) balance for a tenant
  private async getGatewayBalance(tenantUuid: string): Promise<number> {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { xendit_sub_account_id: true },
    });
    if (!pesantren?.xendit_sub_account_id) {
      throw new BadRequestException('Pesantren belum memiliki Xendit sub‑account.');
    }
    const balanceObj = await this.xenditService.getBalanceForSubAccount(pesantren.xendit_sub_account_id);
    const available = (balanceObj as any).available_balance ?? (balanceObj as any).balance ?? 0;
    return Number(available);
  }

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
    if (dto.source === 'tenant_float') {
      return this.distributeTenantWalletToUser(tenantUuid, dto);
    }

    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { manual_topup_fee: true },
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
      let tenantWallet = await tx.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid },
      });
      if (!tenantWallet) {
        tenantWallet = await tx.tenantWallet.create({
          data: { tenant_uuid: tenantUuid, balance: 0 },
        });
      }

      // Cash top-up means the tenant receives physical/offline money from the user.
      // It must not deduct tenant float or touch Mudaq's master balance.
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
          reference: `CASH-TOPUP-${Date.now()}`,
          description: dto.description || `Top up tunai diterima tenant (Biaya Admin: ${adminFee})`,
        },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'cash_student_topup',
          amount: amount,
          balance_before: tenantWallet.balance,
          balance_after: tenantWallet.balance,
          reference: `CASH-TOPUP-${Date.now()}`,
          description: `Uang tunai diterima tenant untuk top up dompet santri (Wallet ID: ${wallet.id})`,
        },
      });

      return updated;
    });
  }

  async distributeTenantWalletToUser(tenantUuid: string, dto: TopupDto) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { min_tenant_wallet_balance: true },
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

    return this.prisma.$transaction(async (tx) => {
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
          'Saldo Induk Pesantren tidak mencukupi untuk distribusi saldo ini (termasuk saldo mengendap).'
        );
      }

      const tenantBalanceBefore = tenantWallet.balance;
      const tenantBalanceAfter = Prisma.Decimal.sub(tenantBalanceBefore, amount);
      await tx.tenantWallet.update({
        where: { id: tenantWallet.id },
        data: { balance: tenantBalanceAfter },
      });

      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'tenant_float_distribution',
          amount: amount,
          balance_before: tenantBalanceBefore,
          balance_after: tenantBalanceAfter,
          reference: `DIST-${Date.now()}`,
          description: dto.description || `Distribusi saldo induk tenant ke dompet user (Wallet ID: ${wallet.id})`,
        },
      });

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, amount);
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.walletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          wallet_id: wallet.id,
          type: 'deposit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `DIST-${Date.now()}`,
          description: dto.description || 'Distribusi saldo dari Saldo Induk Pesantren',
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
          const baseAmount = Number(dto.amount);
          const xenditFeeUser = Math.round(baseAmount * (Number(wallet.student.pesantren.qris_xendit_fee_user || 0) / 100));
          const platformFeeUser = Math.round(baseAmount * (Number(wallet.student.pesantren.qris_platform_fee_user || 0) / 100));
          const platformFeeTenant = Math.round(baseAmount * (Number(wallet.student.pesantren.qris_platform_fee_tenant || 0) / 100));
          surcharge = xenditFeeUser + platformFeeUser;
          platformFeeAmount = platformFeeUser + platformFeeTenant;
        } else {
          const xenditFeeUser = isQRIS
            ? Number(wallet.student.pesantren?.qris_xendit_fee_user || wallet.student.pesantren?.qris_surcharge_fee || 0)
            : Number(wallet.student.pesantren?.xendit_fee_user || wallet.student.pesantren?.surcharge_fee || 0);
          const platformFeeUser = isQRIS
            ? Number(wallet.student.pesantren?.qris_platform_fee_user || 0)
            : Number(wallet.student.pesantren?.platform_fee_user || 0);
          const platformFeeTenant = isQRIS
            ? Number(wallet.student.pesantren?.qris_platform_fee_tenant || wallet.student.pesantren?.qris_platform_fee || 0)
            : Number(wallet.student.pesantren?.platform_fee_tenant || wallet.student.pesantren?.platform_fee || 0);
          surcharge = xenditFeeUser + platformFeeUser;
          platformFeeAmount = platformFeeUser + platformFeeTenant;
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

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

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

      // Cash withdrawal means the tenant pays physical/offline money to the user.
      // The user balance decreases, while tenant float remains unchanged.
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: tenantUuid,
          type: 'cash_student_withdrawal',
          amount: amount,
          balance_before: tenantWallet.balance,
          balance_after: tenantWallet.balance,
          reference: `WD-${Date.now()}`,
          description: `Tarik tunai dari dompet user, dibayar oleh kas tenant (Wallet ID: ${wallet.id})`,
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

  async getTenantFinanceSummary(tenantUuid: string) {
    const [pesantren, tenantWallet, studentWalletSum, staffWalletSum, cashIn, staffCashIn, cashOut, staffCashOut, recentCashEntries] =
      await Promise.all([
        this.prisma.pesantren.findUnique({
          where: { id: tenantUuid },
          select: {
            id: true,
            name: true,
            xendit_sub_account_id: true,
            platform_fee: true,
            qris_platform_fee: true,
            surcharge_fee: true,
            qris_surcharge_fee: true,
            xendit_fee_user: true,
            platform_fee_user: true,
            platform_fee_tenant: true,
            qris_xendit_fee_user: true,
            qris_platform_fee_user: true,
            qris_platform_fee_tenant: true,
          },
        }),
        this.prisma.tenantWallet.findUnique({ where: { tenant_uuid: tenantUuid } }),
        this.prisma.wallet.aggregate({
          where: { tenant_uuid: tenantUuid, student: { deleted_at: null } },
          _sum: { balance: true },
        }),
        this.prisma.userWallet.aggregate({
          where: { tenant_uuid: tenantUuid, user: { deleted_at: null } },
          _sum: { balance: true },
        }),
        this.prisma.tenantWalletTransaction.aggregate({
          where: { tenant_uuid: tenantUuid, type: 'cash_student_topup' },
          _sum: { amount: true },
        }),
        this.prisma.tenantWalletTransaction.aggregate({
          where: { tenant_uuid: tenantUuid, type: 'user_cash_topup' },
          _sum: { amount: true },
        }),
        this.prisma.tenantWalletTransaction.aggregate({
          where: { tenant_uuid: tenantUuid, type: 'cash_student_withdrawal' },
          _sum: { amount: true },
        }),
        this.prisma.tenantWalletTransaction.aggregate({
          where: { tenant_uuid: tenantUuid, type: 'user_cash_withdrawal' },
          _sum: { amount: true },
        }),
        this.prisma.tenantWalletTransaction.findMany({
          where: {
            tenant_uuid: tenantUuid,
            type: { in: ['cash_student_topup', 'cash_student_withdrawal', 'user_cash_topup', 'user_cash_withdrawal'] },
          },
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
      ]);

    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    const gatewayBalance = await this.xenditService.getBalanceForSubAccount(
      pesantren.xendit_sub_account_id,
    );

    const gatewayAvailable = Number(
      (gatewayBalance as any).available_balance ??
        (gatewayBalance as any).balance ??
        0,
    );
    const tenantFloat = Number(tenantWallet?.balance || 0);
    const studentWalletLiability = Number(studentWalletSum._sum.balance || 0);
    const staffWalletLiability = Number(staffWalletSum._sum.balance || 0);
    const userLiability = studentWalletLiability + staffWalletLiability;
    const cashInAmount = Number(cashIn._sum.amount || 0) + Number(staffCashIn._sum.amount || 0);
    const cashOutAmount = Number(cashOut._sum.amount || 0) + Number(staffCashOut._sum.amount || 0);
    const cashOnHandEstimate = cashInAmount - cashOutAmount;
    const internalLiability = tenantFloat + userLiability;
    const backedByGatewayAndCash = gatewayAvailable + cashOnHandEstimate;

    return {
      tenant: {
        id: pesantren.id,
        name: pesantren.name,
        xendit_sub_account_id: pesantren.xendit_sub_account_id,
        xendit_configured: !!pesantren.xendit_sub_account_id,
      },
      gateway: {
        balance: gatewayAvailable,
        raw: gatewayBalance,
        note: 'Saldo sub-account Xendit tenant. Fee platform Mudaq yang dikirim via Xendit fees tidak termasuk saldo ini.',
      },
      internal: {
        tenant_float: tenantFloat,
        user_wallet_liability: userLiability,
        student_wallet_liability: studentWalletLiability,
        staff_wallet_liability: staffWalletLiability,
        total_liability: internalLiability,
      },
      cash_book: {
        cash_in: cashInAmount,
        cash_out: cashOutAmount,
        cash_on_hand_estimate: cashOnHandEstimate,
        recent_entries: recentCashEntries,
      },
      reconciliation: {
        backed_by_gateway_and_cash: backedByGatewayAndCash,
        internal_liability: internalLiability,
        difference: backedByGatewayAndCash - internalLiability,
      },
      fees: {
        va_platform_fee: Number(pesantren.platform_fee || 0),
        qris_platform_fee: Number(pesantren.qris_platform_fee || 0),
        va_surcharge_fee: Number(pesantren.surcharge_fee || 0),
        qris_surcharge_fee: Number(pesantren.qris_surcharge_fee || 0),
        va_xendit_fee_user: Number(pesantren.xendit_fee_user || 0),
        va_platform_fee_user: Number(pesantren.platform_fee_user || 0),
        va_platform_fee_tenant: Number(pesantren.platform_fee_tenant || 0),
        qris_xendit_fee_user: Number(pesantren.qris_xendit_fee_user || 0),
        qris_platform_fee_user: Number(pesantren.qris_platform_fee_user || 0),
        qris_platform_fee_tenant: Number(pesantren.qris_platform_fee_tenant || 0),
      },
    };
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
          type: 'tenant_operational_deposit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `SA-TOPUP-${Date.now()}`,
          description: dto.description || 'Deposit dana operasional tenant ke Saldo Induk Pesantren',
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
          type: 'tenant_operational_withdrawal',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `SA-WD-${Date.now()}`,
          description: dto.description || 'Pencairan/pengurangan dana operasional tenant dari Saldo Induk Pesantren',
        },
      });
      return updated;
    });
  }

  async createTenantWithdrawalRequest(
    tenantUuid: string,
    dto: {
      amount: number;
      bank_channel_code?: string;
      bank_name: string;
      account_no: string;
      account_name: string;
      notes?: string;
    },
  ) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Jumlah penarikan tidak valid');
    }

    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
    });
    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');
    if (pesantren.subscription_status !== 'active') {
      throw new BadRequestException('Penarikan dana gateway hanya bisa dilakukan jika status pesantren AKTIF.');
    }
    if (!pesantren.xendit_sub_account_id) {
      throw new BadRequestException('Pesantren belum memiliki Xendit sub-account.');
    }
    // Validate gateway balance before creating request
    const gatewayBalance = await this.getGatewayBalance(tenantUuid);
    if (gatewayBalance < dto.amount) {
      throw new BadRequestException('Saldo gateway tidak mencukupi');
    }

    const bankChannelCode = this.resolveXenditBankChannel(dto.bank_name, dto.bank_channel_code);
    if (!bankChannelCode) {
      throw new BadRequestException('Kode channel bank Xendit wajib diisi, contoh: ID_BCA.');
    }

    const request = await this.prisma.tenantWithdrawalRequest.create({
      data: {
        tenant_uuid: tenantUuid,
        amount: dto.amount,
        bank_channel_code: bankChannelCode,
        bank_name: dto.bank_name,
        account_no: dto.account_no,
        account_name: dto.account_name,
        notes: dto.notes,
        status: 'pending',
      } as any,
    });

    await this.prisma.pesantren.update({
      where: { id: tenantUuid },
      data: {
        gateway_bank_channel_code: bankChannelCode,
        gateway_bank_name: dto.bank_name,
        gateway_bank_account_no: dto.account_no,
        gateway_bank_account_name: dto.account_name,
      } as any,
    });

    return {
      message: 'Permintaan pencairan dana gateway berhasil dibuat dan menunggu persetujuan Superadmin.',
      request,
    };
  }

  async approveTenantWithdrawalRequest(requestId: string, isApproved: boolean) {
    const request = await this.prisma.tenantWithdrawalRequest.findUnique({
      where: { id: requestId },
      include: { pesantren: true },
    });
    if (!request) throw new NotFoundException('Request tidak ditemukan');
    if (request.status !== 'pending') throw new BadRequestException('Request sudah diproses');

    if (!isApproved) {
      await this.prisma.tenantWithdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'rejected', processed_at: new Date() } as any,
      });
      return { message: 'Request ditolak' };
    }

    if (!request.pesantren?.xendit_sub_account_id) {
      throw new BadRequestException('Pesantren belum memiliki Xendit sub-account.');
    }

    // Re‑check gateway balance before initiating payout to avoid race conditions
    const gatewayBalance = await this.getGatewayBalance(request.tenant_uuid);
    if (gatewayBalance < Number(request.amount)) {
      throw new BadRequestException('Saldo gateway tidak mencukupi untuk pencairan');
    }

    const bankChannelCode = this.resolveXenditBankChannel(
      request.bank_name,
      (request as any).bank_channel_code,
    );
    if (!bankChannelCode) {
      throw new BadRequestException('Kode channel bank Xendit wajib diisi, contoh: ID_BCA.');
    }

    const referenceId = (request as any).payout_reference_id || `WD-${request.id}`;
    const payout = await this.xenditService.createPayoutForSubAccount({
      subAccountId: request.pesantren.xendit_sub_account_id,
      referenceId,
      channelCode: bankChannelCode,
      accountNumber: request.account_no,
      accountHolderName: request.account_name,
      amount: Math.round(Number(request.amount)),
      description: `Pencairan dana gateway ${request.pesantren.name}`,
      emailTo: request.pesantren.email || undefined,
    });

    const internalStatus = this.mapPayoutStatus(payout.status);
    const updatedRequest = await this.prisma.tenantWithdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: internalStatus,
        bank_channel_code: bankChannelCode,
        xendit_payout_id: payout.id,
        payout_reference_id: payout.reference_id || referenceId,
        payout_status: payout.status,
        processed_at: internalStatus === 'processing' ? null : new Date(),
      } as any,
      include: { pesantren: true },
    });

    if (updatedRequest.pesantren?.email) {
      try {
        const amountFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(updatedRequest.amount));
        const dateStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        const subject = `Pencairan Dana Gateway Diproses - ${updatedRequest.pesantren.name}`;
        const html = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2>Pencairan Dana Gateway Diproses</h2>
            <p>Halo <strong>${updatedRequest.pesantren.name}</strong>,</p>
            <p>Permintaan pencairan dana gateway Anda telah dikirim ke Xendit dan sedang diproses.</p>
            <table style="width: 100%; max-width: 600px; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">ID Transaksi</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${updatedRequest.id}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Tanggal</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Bank Tujuan</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${updatedRequest.bank_name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">No. Rekening</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${updatedRequest.account_no}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Atas Nama</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${updatedRequest.account_name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Status Xendit</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${payout.status}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 16px;">Nominal Pencairan</td>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #10b981;">${amountFormatted}</td>
              </tr>
            </table>
            <p>Status final akan disinkronkan otomatis melalui webhook Xendit.</p>
            <p>Terima kasih telah menggunakan layanan MUDAQ.</p>
            <br/>
            <p>Salam,</p>
            <p><strong>Tim MUDAQ</strong></p>
          </div>
        `;
        this.mailService.sendMail(updatedRequest.pesantren.email, subject, html).catch(e => {
          this.logger.error('Failed to send withdrawal invoice email', e);
        });
      } catch (e) {
        this.logger.error('Failed to prepare withdrawal invoice email', e);
      }
    }

    return { message: 'Request disetujui dan payout Xendit dibuat', request: updatedRequest };
  }

  async generateWithdrawInvoiceHtml(id: string): Promise<string> {
    const req = await this.prisma.tenantWithdrawalRequest.findUnique({ where: { id }, include: { pesantren: true } });
    if (!req) throw new NotFoundException('Request tidak ditemukan');
    if (!['processing', 'succeeded'].includes(req.status)) {
      throw new BadRequestException('Hanya request yang sudah diproses Xendit yang memiliki bukti pencairan');
    }

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
          <title>Bukti Pencairan Dana Gateway - ${req.id}</title>
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
                      <div class="status-badge" style="margin-top: 8px;">${req.status === 'succeeded' ? 'CAIR' : 'DIPROSES'}</div>
                  </div>
              </div>

              <div class="details-grid">
                  <div class="detail-item">
                      <span class="detail-label">Tanggal Pencairan</span>
                      <span class="detail-value">${date} ${time}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Jenis Transaksi</span>
                      <span class="detail-value">Tarik Dana Gateway Xendit</span>
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
                              <div style="font-weight: 600; color: #1e293b;">Pencairan Dana Gateway Xendit ke Rekening Bank</div>
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
                  <p>Ini adalah bukti transaksi Pencairan Dana Gateway Pesantren yang diterbitkan oleh sistem MUDAQ.</p>
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

  async getTenantTopupRequests(targetUuid?: string, status?: string) {
    const where: any = {};
    if (targetUuid) where.tenant_uuid = targetUuid;
    if (status) where.status = status;

    return this.prisma.tenantTopupRequest.findMany({
      where,
      include: {
        pesantren: { select: { name: true, domain: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async approveTenantTopupRequest(requestId: string, isApproved: boolean) {
    const request = await this.prisma.tenantTopupRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request tidak ditemukan');
    if (request.status !== 'pending') throw new BadRequestException('Request sudah diproses');

    if (!isApproved) {
      await this.prisma.tenantTopupRequest.update({
        where: { id: requestId },
        data: { status: 'rejected' },
      });
      return { message: 'Request ditolak' };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Approve Request
      const approved = await tx.tenantTopupRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });

      // 2. Add Balance to Tenant Wallet
      let wallet = await tx.tenantWallet.findUnique({ where: { tenant_uuid: request.tenant_uuid } });
      if (!wallet) {
        wallet = await tx.tenantWallet.create({ data: { tenant_uuid: request.tenant_uuid, balance: 0 } });
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = Prisma.Decimal.add(balanceBefore, request.amount);

      await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // 3. Create Transaction Log
      await tx.tenantWalletTransaction.create({
        data: {
          tenant_uuid: request.tenant_uuid,
          type: 'tenant_operational_deposit',
          amount: request.amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference: `REQ-TOPUP-${requestId}`,
          description: `Setoran kas/float disetujui (${request.notes || ''})`,
        },
      });

      return approved;
    });

    return { message: 'Request disetujui dan saldo ditambahkan', request: updated };
  }
}
