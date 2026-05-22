import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateFeeCategoryDto,
  UpdateFeeCategoryDto,
  GenerateBillsDto,
  RecordPaymentDto,
  RecordDonationDto,
  RecordDisbursementDto,
  PayBulkDto,
} from './dto/billing.dto';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private whatsapp: WhatsappService,
  ) {
    this.logger.log('BillingService Initialized');
  }
  
  async payBulkBills(tenantUuid: string, dto: PayBulkDto) {
    this.logger.log(`Processing payBulkBills v2 for tenant ${tenantUuid}`);
    if (!dto.bill_ids || dto.bill_ids.length === 0) {
      throw new BadRequestException('Pilih minimal satu tagihan');
    }

    const bills = await this.prisma.bill.findMany({
      where: {
        id: { in: dto.bill_ids },
        tenant_uuid: tenantUuid,
        status: { in: ['pending', 'partial'] },
      },
      include: { student: true, fee_category: true },
    });

    if (bills.length === 0) throw new BadRequestException('Tagihan tidak ditemukan atau sudah lunas');

    const totalAmount = bills.reduce((acc, b) => acc + (Number(b.amount) - Number(b.amount_paid)), 0);
    const firstBill = bills[0];

    // 1. Payment Gateway Logic
    if (dto.payment_method === 'payment_gateway') {
      const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
      const isDemo = xenditKey.startsWith('xnd_development_');

      if (isDemo) {
        this.logger.log(`[DEMO MODE] Auto-paying bulk bills for tenant ${tenantUuid}`);
        return await this.prisma.$transaction(async (tx) => {
          for (const bill of bills) {
            const remaining = Number(bill.amount) - Number(bill.amount_paid);
            await tx.bill.update({
              where: { id: bill.id },
              data: { amount_paid: bill.amount, status: 'paid' },
            });

            await tx.transaction.create({
              data: {
                tenant_uuid: tenantUuid,
                reference_no: `PAY-DEMO-${bill.id}-${uuidv4().slice(0, 8)}`,
                student_id: bill.student_id,
                bill_id: bill.id,
                fee_category_id: bill.fee_category_id,
                amount_paid: new Prisma.Decimal(remaining),
                payment_method: 'payment_gateway',
                payment_channel: dto.payment_channel || 'Xendit Demo',
                status: 'success',
              },
            });
          }
          return { paid_bills_count: bills.length, total_paid: totalAmount, status: 'PAID', demo_mode: true };
        });
      }

      const externalId = `PAY-BULK-${firstBill.student_id}-${Date.now()}`;
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { 
          xendit_sub_account_id: true, 
          platform_fee: true, 
          surcharge_fee: true, 
          qris_platform_fee: true, 
          qris_surcharge_fee: true, 
          qris_fee_is_percent: true 
        },
      });

      let paymentData: any;
      let surcharge = 0;
      let platformFeeAmount = 0;

      if (xenditKey) {
        try {
          const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
          const headers: any = {
            Authorization: `Basic ${Buffer.from(xenditKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
          };

          if (!pesantren?.xendit_sub_account_id) {
            throw new BadRequestException('Pesantren belum dikonfigurasi dengan akun pembayaran Xendit.');
          }
          headers['for-user-id'] = pesantren.xendit_sub_account_id;

          const isQRIS = dto.payment_channel === 'QRIS';
          if (isQRIS && pesantren?.qris_fee_is_percent) {
            surcharge = Math.round(totalAmount * (Number(pesantren.qris_surcharge_fee) / 100));
            platformFeeAmount = Math.round((totalAmount + surcharge) * (Number(pesantren.qris_platform_fee) / 100));
          } else {
            surcharge = isQRIS ? Number(pesantren?.qris_surcharge_fee || 0) : Number(pesantren?.surcharge_fee || 0);
            platformFeeAmount = isQRIS ? Number(pesantren?.qris_platform_fee || 0) : Number(pesantren?.platform_fee || 0);
          }

          const finalTotal = totalAmount + surcharge;
          const feeConfig = platformFeeAmount > 0 ? { fees: [{ type: 'PLATFORM_FEE', value: platformFeeAmount }] } : {};

          const successUrl = this.config.get<string>('XENDIT_SUCCESS_URL');
          const failureUrl = this.config.get<string>('XENDIT_FAILURE_URL');

          const resp = await fetch(`${baseUrl}/v2/invoices`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              external_id: externalId,
              amount: finalTotal,
              description: `Pembayaran ${bills.length} Tagihan - ${firstBill.student.name}`,
              invoice_duration: 3600,
              currency: 'IDR',
              payment_methods: dto.payment_channel === 'QRIS' ? ['QRIS'] : undefined,
              success_redirect_url: successUrl,
              failure_redirect_url: failureUrl,
              ...feeConfig,
            }),
          });

          const data = await resp.json();
          if (!resp.ok) throw new BadRequestException(`Xendit Error: ${data.message || 'Error'}`);
          paymentData = { type: 'INVOICE', id: data.id, invoice_url: data.invoice_url, amount: totalAmount, external_id: externalId };
        } catch (err) {
          throw new BadRequestException(`Gagal menghubungi Xendit: ${err.message}`);
        }
      } else {
        paymentData = { type: 'INVOICE', id: `demo_${Date.now()}`, invoice_url: `https://checkout.xendit.co/web/demo_${Date.now()}`, external_id: externalId, amount: totalAmount };
      }

      // Create pending transactions for each bill
      for (const bill of bills) {
        const remaining = Number(bill.amount) - Number(bill.amount_paid);
        await this.prisma.transaction.create({
          data: {
            tenant_uuid: tenantUuid,
            reference_no: `PAY-${bill.id}-${uuidv4().slice(0, 8)}`,
            student_id: bill.student_id,
            bill_id: bill.id,
            fee_category_id: bill.fee_category_id,
            amount_paid: new Prisma.Decimal(remaining),
            payment_method: 'payment_gateway',
            payment_channel: dto.payment_channel || 'Xendit',
            status: 'pending',
            xendit_invoice_id: paymentData.id,
          },
        });
      }

      return paymentData;
    }

    // 2. Wallet (Saldo Santri) Logic
    return await this.prisma.$transaction(async (tx) => {
      if (dto.payment_method === 'saldo_santri') {
        const wallet = await tx.wallet.findFirst({ where: { student_id: firstBill.student_id, tenant_uuid: tenantUuid } });
        if (!wallet || Number(wallet.balance) < totalAmount) {
          throw new BadRequestException('Saldo santri tidak mencukupi');
        }
        if (!dto.pin) throw new BadRequestException('PIN diperlukan');
        if (!wallet.pin) throw new BadRequestException('PIN belum diatur');
        const isValid = await bcrypt.compare(dto.pin, wallet.pin);
        if (!isValid) throw new BadRequestException('PIN tidak sesuai');

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalAmount } },
        });

        await tx.walletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: wallet.id,
            type: 'payment',
            amount: new Prisma.Decimal(totalAmount),
            balance_before: wallet.balance,
            balance_after: new Prisma.Decimal(Number(wallet.balance) - totalAmount),
            reference: `PAY-BULK-${Date.now()}`,
            description: `Pembayaran ${bills.length} tagihan`,
          },
        });
      }

      for (const bill of bills) {
        const remaining = Number(bill.amount) - Number(bill.amount_paid);
        await tx.bill.update({
          where: { id: bill.id },
          data: { amount_paid: bill.amount, status: 'paid' },
        });

        await tx.transaction.create({
          data: {
            tenant_uuid: tenantUuid,
            reference_no: `PAY-${bill.id}-${uuidv4().slice(0, 8)}`,
            student_id: bill.student_id,
            bill_id: bill.id,
            fee_category_id: bill.fee_category_id,
            amount_paid: new Prisma.Decimal(remaining),
            payment_method: dto.payment_method,
            status: 'success',
          },
        });
      }

      return { paid_bills_count: bills.length, total_paid: totalAmount };
    });
  }

  // ── Fee Category CRUD ──
  async createFeeCategory(tenantUuid: string, dto: CreateFeeCategoryDto) {
    return this.prisma.feeCategory.create({
      data: {
        ...dto,
        amount: new Prisma.Decimal(dto.amount),
        tenant_uuid: tenantUuid,
      },
    });
  }

  async getFeeCategories(tenantUuid: string) {
    const categories = await this.prisma.feeCategory.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { name: 'asc' },
    });

    const enriched = await Promise.all(
      categories.map(async (cat) => {
        if (cat.type === 'donation') {
          const [received, disbursed] = await Promise.all([
            this.prisma.transaction.aggregate({
              where: {
                fee_category_id: cat.id,
                status: 'success',
              },
              _sum: { amount_paid: true, net_amount: true },
            }),
            this.prisma.donationDisbursement.aggregate({
              where: {
                fee_category_id: cat.id,
                status: 'success',
              },
              _sum: { amount: true },
            }),
          ]);

          return {
            ...cat,
            total_collected: Number(received._sum.amount_paid || 0),
            total_net_collected: Number(received._sum.net_amount || received._sum.amount_paid || 0),
            total_disbursed: Number(disbursed._sum.amount || 0),
          };
        }
        return cat;
      }),
    );

    return enriched;
  }

  async updateFeeCategory(
    tenantUuid: string,
    id: string,
    dto: UpdateFeeCategoryDto,
  ) {
    const cat = await this.prisma.feeCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!cat) throw new NotFoundException('Kategori biaya tidak ditemukan');
    return this.prisma.feeCategory.update({
      where: { id },
      data: {
        ...dto,
        amount: dto.amount ? new Prisma.Decimal(dto.amount) : undefined,
      },
    });
  }

  async deleteFeeCategory(tenantUuid: string, id: string) {
    const cat = await this.prisma.feeCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        _count: {
          select: { bills: true, transactions: true },
        },
      },
    });
    if (!cat) throw new NotFoundException('Kategori biaya tidak ditemukan');
    if (cat._count.bills > 0 || cat._count.transactions > 0) {
      throw new BadRequestException(
        'Kategori tidak bisa dihapus karena sudah memiliki data transaksi/tagihan',
      );
    }
    return this.prisma.feeCategory.delete({ where: { id } });
  }

  // ── Bills ──
  async generateBills(tenantUuid: string, dto: GenerateBillsDto) {
    const category = await this.prisma.feeCategory.findFirst({
      where: { id: dto.fee_category_id, tenant_uuid: tenantUuid },
    });
    if (!category)
      throw new NotFoundException('Kategori biaya tidak ditemukan');

    const studentWhere: any = { 
      tenant_uuid: tenantUuid, 
      status: { in: ['AKTIF', 'active'] },
      deleted_at: null 
    };
    if (dto.student_ids?.length) studentWhere.id = { in: dto.student_ids };
    if (dto.classroom_id) studentWhere.classroom_id = dto.classroom_id;
    if (dto.dormitory_id) studentWhere.dormitory_id = dto.dormitory_id;
    if (dto.dormitory_room_id) studentWhere.dormitory_room_id = dto.dormitory_room_id;

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: { id: true, name: true, parent_phone: true },
    });

    let created = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const student of students) {
        const exists = await tx.bill.findFirst({
          where: {
            student_id: student.id,
            fee_category_id: dto.fee_category_id,
            period: dto.period,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const bill = await tx.bill.create({
          data: {
            tenant_uuid: tenantUuid,
            student_id: student.id,
            fee_category_id: dto.fee_category_id,
            amount: category.amount,
            period: dto.period,
            due_date: new Date(dto.due_date),
          },
        });

        if (student.parent_phone) {
          const user = await tx.user.findFirst({
            where: { phone: student.parent_phone },
          });
          if (user) {
            await tx.userNotification.create({
              data: {
                user_id: user.id,
                type: 'BILL',
                title: 'Tagihan Baru',
                message: `Terdapat tagihan baru (${category.name}) untuk ananda ${student.name} sejumlah Rp${category.amount}.`,
                action_data: { bill_id: bill.id },
              },
            });
          }
        }
        created++;
      }
    });

    this.logger.log(
      `Bills generated: ${created} created, ${skipped} skipped for tenant ${tenantUuid}`,
    );
    return { created, skipped, total_students: students.length };
  }

  async getBills(
    tenantUuid: string,
    page = 1,
    limit = 20,
    status?: string,
    studentId?: string,
    studentStatus?: string,
  ) {
    const where: any = { tenant_uuid: tenantUuid };
    if (status) where.status = status;
    if (studentId) where.student_id = studentId;
    if (studentStatus) where.student = { status: studentStatus };

    const [data, total] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { id: true, name: true, nis: true, parent_phone: true } },
          fee_category: { select: { id: true, name: true } },
        },
        orderBy: { due_date: 'desc' },
      }),
      this.prisma.bill.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Payment ──
  async recordPayment(tenantUuid: string, dto: RecordPaymentDto) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: dto.bill_id, tenant_uuid: tenantUuid },
    });
    if (!bill) throw new NotFoundException('Tagihan tidak ditemukan');

    const remaining = Number(bill.amount) - Number(bill.amount_paid);
    if (dto.amount > remaining)
      throw new BadRequestException('Jumlah melebihi sisa tagihan');

    const refNo = `PAY-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const newPaid = Number(bill.amount_paid) + dto.amount;
    const newStatus = newPaid >= Number(bill.amount) ? 'paid' : 'partial';

    if (dto.payment_method === 'payment_gateway') {
      const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
      const isDemo = xenditKey.startsWith('xnd_development_');

      if (isDemo) {
        this.logger.log(`[DEMO MODE] Auto-paying bill ${bill.id} for tenant ${tenantUuid}`);
        return await this.prisma.$transaction(async (tx) => {
          const updatedBill = await tx.bill.update({
            where: { id: bill.id },
            data: { amount_paid: new Prisma.Decimal(newPaid), status: newStatus },
          });

          const transaction = await tx.transaction.create({
            data: {
              tenant_uuid: tenantUuid,
              reference_no: `PAY-DEMO-${bill.id}-${uuidv4().slice(0, 8)}`,
              student_id: bill.student_id,
              bill_id: bill.id,
              fee_category_id: bill.fee_category_id,
              amount_paid: new Prisma.Decimal(dto.amount),
              payment_method: 'payment_gateway',
              payment_channel: dto.payment_channel || 'Xendit Demo',
              status: 'success',
            },
          });

          return { bill: updatedBill, transaction, status: 'PAID', demo_mode: true };
        });
      }

      const externalId = `PAY-${bill.id}-${uuidv4().slice(0, 8)}`;
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { xendit_sub_account_id: true, platform_fee: true, surcharge_fee: true, qris_platform_fee: true, qris_surcharge_fee: true, qris_fee_is_percent: true },
      });
      const student = await this.prisma.student.findUnique({
        where: { id: bill.student_id },
      });

      let paymentData: any;
      let surcharge = 0;
      let platformFeeAmount = 0;
      if (xenditKey) {
        try {
          const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
          const headers: any = {
            Authorization: `Basic ${Buffer.from(xenditKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
          };
          
          // Strict Validation: Sub-account ID is MANDATORY for multi-tenant isolation
          if (!pesantren?.xendit_sub_account_id) {
            throw new BadRequestException('Pesantren belum dikonfigurasi dengan akun pembayaran Xendit. Hubungi Administrator.');
          }

          if (/^[0-9a-fA-F]{24}$/.test(pesantren.xendit_sub_account_id)) {
            headers['for-user-id'] = pesantren.xendit_sub_account_id;
          } else {
            this.logger.error(`[XENDIT] Critical Config Error: Invalid sub_account_id format for tenant ${tenantUuid}: "${pesantren.xendit_sub_account_id}"`);
            throw new BadRequestException('ID Akun Pembayaran Pesantren tidak valid. Mohon periksa pengaturan pesantren.');
          }
          const isVA = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'VA'].includes(dto.payment_channel || '');
          const isQRIS = dto.payment_channel === 'QRIS';

          if (isQRIS && pesantren?.qris_fee_is_percent) {
            const surchargePercent = Number(pesantren.qris_surcharge_fee || 0);
            const platformPercent = Number(pesantren.qris_platform_fee || 0);
            
            surcharge = Math.round(Number(dto.amount) * (surchargePercent / 100));
            const totalWithSurcharge = Number(dto.amount) + surcharge;
            
            const rawPlatformFeeAmount = Math.round(totalWithSurcharge * (platformPercent / 100));
            const estimatedXenditFee = Math.round(totalWithSurcharge * 0.007 * 1.11);
            platformFeeAmount = Math.max(0, rawPlatformFeeAmount - estimatedXenditFee);
          } else {
            surcharge = isQRIS ? Number(pesantren?.qris_surcharge_fee || 0) : Number(pesantren?.surcharge_fee || 0);
            const rawPlatformFeeAmount = isQRIS ? Number(pesantren?.qris_platform_fee || 0) : Number(pesantren?.platform_fee || 0);
            
            const estimatedXenditFee = isQRIS ? Math.round((Number(dto.amount) + surcharge) * 0.007 * 1.11) : Math.round(4500 * 1.11);
            platformFeeAmount = Math.max(0, rawPlatformFeeAmount - estimatedXenditFee);
          }
          
          const totalAmount = Number(dto.amount) + surcharge;

          const feeConfig = platformFeeAmount > 0 ? {
            fees: [{ type: 'PLATFORM_FEE', value: platformFeeAmount }]
          } : {};

          // Only use Direct VA if a specific bank code is provided (not the general 'VA' category)
          const isDirectVA = isVA && dto.payment_channel !== 'VA';

          if (isDirectVA) {
            const resp = await fetch(`${baseUrl}/callback_virtual_accounts`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                external_id: externalId,
                bank_code: dto.payment_channel,
                name: (student?.name || 'Santri').substring(0, 50),
                expected_amount: totalAmount,
                is_closed: true,
                is_single_use: true,
                ...feeConfig,
              }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new BadRequestException(`Xendit VA Error: ${data.message || 'Error'}`);
            paymentData = { type: 'VA', id: data.id, bank_code: data.bank_code, account_number: data.account_number, amount: totalAmount, external_id: externalId };
          } else {
            const successUrl = this.config.get<string>('XENDIT_SUCCESS_URL');
            const failureUrl = this.config.get<string>('XENDIT_FAILURE_URL');

            const resp = await fetch(`${baseUrl}/v2/invoices`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                external_id: externalId,
                amount: totalAmount,
                description: `Pembayaran Tagihan - ${(student?.name || 'Santri')}`,
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
            paymentData = { type: 'INVOICE', id: data.id, invoice_url: data.invoice_url, amount: dto.amount, external_id: externalId };
          }
        } catch (err) {
          if (err.status === 400 || err.name === 'BadRequestException' || err instanceof BadRequestException) throw err;
          const detail = err.cause ? `${err.message} (${err.cause.code || err.cause})` : err.message;
          this.logger.error(`[XENDIT] Network/API Error: ${detail}`, err.stack);
          throw new BadRequestException(`Gagal menghubungi Xendit: ${detail}. Pastikan server bisa mengakses internet.`);
        }
      } else {
        paymentData = { type: 'INVOICE', id: `demo_${Date.now()}`, invoice_url: `https://checkout.xendit.co/web/demo_${Date.now()}`, external_id: externalId, amount: dto.amount };
      }

      const transaction = await this.prisma.transaction.create({
        data: {
          tenant_uuid: tenantUuid,
          reference_no: externalId,
          student_id: bill.student_id,
          bill_id: bill.id,
          fee_category_id: bill.fee_category_id,
          amount_paid: new Prisma.Decimal(dto.amount),
          payment_method: 'payment_gateway',
          payment_channel: dto.payment_channel || 'Xendit',
          status: 'pending',
          xendit_invoice_id: paymentData.id,
          platform_fee: new Prisma.Decimal(platformFeeAmount),
          surcharge_fee: new Prisma.Decimal(surcharge),
        },
      });

      return {
        ...paymentData,
        transaction_id: transaction.id,
        status: 'PENDING_PAYMENT',
      };
    }

    return await this.prisma.$transaction(async (tx) => {
      // Handle saldo_santri payment
      if (dto.payment_method === 'saldo_santri') {
        this.logger.log(`[PAYMENT] Processing balance payment for student: ${bill.student_id}, amount: ${dto.amount}`);
        const wallet = await tx.wallet.findFirst({
          where: { student_id: bill.student_id, tenant_uuid: tenantUuid },
        });

        if (!wallet) {
          this.logger.warn(`[PAYMENT] Wallet not found for student: ${bill.student_id}`);
          throw new BadRequestException('Dompet santri tidak ditemukan');
        }

        if (Number(wallet.balance) < dto.amount) {
          this.logger.warn(`[PAYMENT] Insufficient balance for student: ${bill.student_id}. Balance: ${wallet.balance}, Required: ${dto.amount}`);
          throw new BadRequestException('Saldo santri tidak mencukupi');
        }

        if (!dto.pin) throw new BadRequestException('PIN diperlukan untuk pembayaran dengan saldo');
        if (!wallet.pin) throw new BadRequestException('PIN dompet belum diatur');
        
        const isValid = await bcrypt.compare(dto.pin, wallet.pin);
        if (!isValid) {
          this.logger.warn(`[PAYMENT] Invalid PIN attempt for wallet: ${wallet.id}`);
          throw new BadRequestException('PIN tidak sesuai');
        }
        
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: dto.amount } },
        });

        await tx.walletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: wallet.id,
            type: 'payment',
            amount: new Prisma.Decimal(dto.amount),
            balance_before: wallet.balance,
            balance_after: new Prisma.Decimal(Number(wallet.balance) - dto.amount),
            reference: refNo,
            description: `Pembayaran tagihan ${bill.fee_category_id}`,
          },
        });
      }

      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: { amount_paid: new Prisma.Decimal(newPaid), status: newStatus },
      });

      const transaction = await tx.transaction.create({
        data: {
          tenant_uuid: tenantUuid,
          reference_no: refNo,
          student_id: bill.student_id,
          bill_id: bill.id,
          fee_category_id: bill.fee_category_id,
          amount_paid: new Prisma.Decimal(dto.amount),
          payment_method: dto.payment_method,
          status: 'success',
        },
      });

      return { bill: updatedBill, transaction };
    });
  }

  async recordDonation(tenantUuid: string, dto: RecordDonationDto) {
    const category = await this.prisma.feeCategory.findFirst({
      where: { id: dto.fee_category_id, tenant_uuid: tenantUuid },
    });
    if (!category || category.type !== 'donation') {
      throw new BadRequestException('Kategori donasi tidak valid');
    }

    const refNo = `DON-${Date.now()}-${uuidv4().slice(0, 8)}`;

    if (dto.payment_method === 'payment_gateway') {
      const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY') || '';
      const isDemo = xenditKey.startsWith('xnd_development_');

      if (isDemo) {
        this.logger.log(`[DEMO MODE] Auto-paying donation for tenant ${tenantUuid}`);
        const transaction = await this.prisma.transaction.create({
          data: {
            tenant_uuid: tenantUuid,
            reference_no: `DON-DEMO-${Date.now()}-${uuidv4().slice(0, 8)}`,
            student_id: dto.student_id,
            fee_category_id: category.id,
            amount_paid: new Prisma.Decimal(dto.amount),
            payment_method: 'payment_gateway',
            payment_channel: dto.payment_channel || 'Xendit Demo',
            status: 'success',
          },
        });

        return { transaction, status: 'PAID', demo_mode: true };
      }

      const externalId = `DON-${dto.student_id}-${category.id}-${uuidv4().slice(0, 8)}`;
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { xendit_sub_account_id: true, platform_fee: true, surcharge_fee: true, qris_platform_fee: true, qris_surcharge_fee: true, qris_fee_is_percent: true },
      });
      const student = await this.prisma.student.findFirst({
        where: { id: dto.student_id, tenant_uuid: tenantUuid },
      });
      if (!student) throw new BadRequestException('Santri tidak valid atau tidak ditemukan');

      let paymentData: any;
      let surcharge = 0;
      let platformFeeAmount = 0;
      if (xenditKey) {
        try {
          const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
          const headers: any = {
            Authorization: `Basic ${Buffer.from(xenditKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
          };
          
          // Strict Validation: Sub-account ID is MANDATORY for multi-tenant isolation
          if (!pesantren?.xendit_sub_account_id) {
            throw new BadRequestException('Pesantren belum dikonfigurasi dengan akun pembayaran Xendit. Hubungi Administrator.');
          }

          if (/^[0-9a-fA-F]{24}$/.test(pesantren.xendit_sub_account_id)) {
            headers['for-user-id'] = pesantren.xendit_sub_account_id;
          } else {
            this.logger.error(`[XENDIT] Critical Config Error: Invalid sub_account_id format for tenant ${tenantUuid}: "${pesantren.xendit_sub_account_id}"`);
            throw new BadRequestException('ID Akun Pembayaran Pesantren tidak valid. Mohon periksa pengaturan pesantren.');
          }

          const isVA = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'VA'].includes(dto.payment_channel || '');
          const isQRIS = dto.payment_channel === 'QRIS';

          if (isQRIS && pesantren?.qris_fee_is_percent) {
            const surchargePercent = Number(pesantren.qris_surcharge_fee || 0);
            const platformPercent = Number(pesantren.qris_platform_fee || 0);
            
            surcharge = Math.round(Number(dto.amount) * (surchargePercent / 100));
            const totalWithSurcharge = Number(dto.amount) + surcharge;
            
            const rawPlatformFeeAmount = Math.round(totalWithSurcharge * (platformPercent / 100));
            const estimatedXenditFee = Math.round(totalWithSurcharge * 0.007 * 1.11);
            platformFeeAmount = Math.max(0, rawPlatformFeeAmount - estimatedXenditFee);
          } else {
            surcharge = isQRIS ? Number(pesantren?.qris_surcharge_fee || 0) : Number(pesantren?.surcharge_fee || 0);
            const rawPlatformFeeAmount = isQRIS ? Number(pesantren?.qris_platform_fee || 0) : Number(pesantren?.platform_fee || 0);
            
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
                name: student?.name.substring(0, 50),
                expected_amount: totalAmount,
                is_closed: true,
                is_single_use: true,
                ...feeConfig,
              }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new BadRequestException(`Xendit VA Error: ${data.message || 'Error'}`);
            paymentData = { type: 'VA', id: data.id, bank_code: data.bank_code, account_number: data.account_number, amount: totalAmount, external_id: externalId };
          } else {
            const successUrl = this.config.get<string>('XENDIT_SUCCESS_URL');
            const failureUrl = this.config.get<string>('XENDIT_FAILURE_URL');

            const resp = await fetch(`${baseUrl}/v2/invoices`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                external_id: externalId,
                amount: totalAmount,
                description: `Donasi ${category.name} - ${student?.name}`,
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
            paymentData = { type: 'INVOICE', id: data.id, invoice_url: data.invoice_url, amount: dto.amount, external_id: externalId };
          }
        } catch (err) {
          if (err.status === 400 || err.name === 'BadRequestException' || err instanceof BadRequestException) throw err;
          const detail = err.cause ? `${err.message} (${err.cause.code || err.cause})` : err.message;
          this.logger.error(`[XENDIT] Network/API Error: ${detail}`, err.stack);
          throw new BadRequestException(`Gagal menghubungi Xendit: ${detail}. Pastikan server bisa mengakses internet.`);
        }
      } else {
        paymentData = { type: 'INVOICE', id: `demo_${Date.now()}`, invoice_url: `https://checkout.xendit.co/web/demo_${Date.now()}`, external_id: externalId, amount: dto.amount };
      }
    

      const transaction = await this.prisma.transaction.create({
        data: {
          tenant_uuid: tenantUuid,
          reference_no: externalId,
          student_id: dto.student_id,
          fee_category_id: category.id,
          amount_paid: new Prisma.Decimal(dto.amount),
          payment_method: 'payment_gateway',
          payment_channel: dto.payment_channel || 'Xendit',
          status: 'pending',
          xendit_invoice_id: paymentData.id,
          platform_fee: new Prisma.Decimal(platformFeeAmount),
          surcharge_fee: new Prisma.Decimal(surcharge),
        },
      });

      return {
        ...paymentData,
        transaction_id: transaction.id,
        status: 'PENDING_PAYMENT',
      };
    }

    return await this.prisma.$transaction(async (tx) => {
      // Handle saldo_santri payment
      if (dto.payment_method === 'saldo_santri') {
        const wallet = await tx.wallet.findFirst({
          where: { student_id: dto.student_id, tenant_uuid: tenantUuid },
        });
        if (!wallet || Number(wallet.balance) < dto.amount) {
          throw new BadRequestException('Saldo santri tidak mencukupi');
        }

        if (!dto.pin) throw new BadRequestException('PIN diperlukan untuk donasi dengan saldo');
        if (!wallet.pin) throw new BadRequestException('PIN dompet belum diatur');
        const isValid = await bcrypt.compare(dto.pin, wallet.pin);
        if (!isValid) throw new BadRequestException('PIN tidak sesuai');
        
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: dto.amount } },
        });

        await tx.walletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: wallet.id,
            type: 'payment',
            amount: new Prisma.Decimal(dto.amount),
            balance_before: wallet.balance,
            balance_after: new Prisma.Decimal(Number(wallet.balance) - dto.amount),
            reference: refNo,
            description: `Donasi ${category.name}`,
          },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          tenant_uuid: tenantUuid,
          reference_no: refNo,
          student_id: dto.student_id,
          fee_category_id: dto.fee_category_id,
          amount_paid: new Prisma.Decimal(dto.amount),
          payment_method: dto.payment_method,
          status: 'success',
        },
      });

      // Check for auto-close
      if (Number(category.amount) > 0) {
        const received = await tx.transaction.aggregate({
          where: {
            fee_category_id: category.id,
            status: 'success',
          },
          _sum: { amount_paid: true },
        });

        const totalCollected = Number(received._sum.amount_paid || 0);
        if (totalCollected >= Number(category.amount)) {
          await tx.feeCategory.update({
            where: { id: category.id },
            data: { is_active: false },
          });
        }
      }

      return { transaction };
    });
  }

  async getTransactions(tenantUuid: string, page = 1, limit = 20, type?: string) {
    const where: any = { tenant_uuid: tenantUuid };
    if (type) {
      where.fee_category = { type };
    }
    
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { name: true, nis: true, status: true } },
          fee_category: { select: { name: true, type: true } },
        },
        orderBy: { payment_date: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Disbursement ──
  async recordDisbursement(tenantUuid: string, dto: RecordDisbursementDto) {
    const category = await this.prisma.feeCategory.findFirst({
      where: { id: dto.fee_category_id, tenant_uuid: tenantUuid },
    });
    if (!category || category.type !== 'donation') {
      throw new BadRequestException('Kategori donasi tidak valid');
    }

    return this.prisma.donationDisbursement.create({
      data: {
        tenant_uuid: tenantUuid,
        fee_category_id: dto.fee_category_id,
        amount: new Prisma.Decimal(dto.amount),
        recipient: dto.recipient,
        description: dto.description,
      },
    });
  }

  async getDisbursements(tenantUuid: string, page = 1, limit = 20) {
    const where = { tenant_uuid: tenantUuid };
    const [data, total] = await Promise.all([
      this.prisma.donationDisbursement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          fee_category: { select: { name: true } },
        },
        orderBy: { disbursement_date: 'desc' },
      }),
      this.prisma.donationDisbursement.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDonationSummary(tenantUuid: string) {
    const [received, disbursed] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          tenant_uuid: tenantUuid,
          fee_category: { type: 'donation' },
          status: 'success',
        },
        _sum: { amount_paid: true },
      }),
      this.prisma.donationDisbursement.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'success' },
        _sum: { amount: true },
      }),
    ]);

    const totalReceived = Number(received._sum.amount_paid || 0);
    const totalDisbursed = Number(disbursed._sum.amount || 0);

    return {
      total_received: totalReceived,
      total_disbursed: totalDisbursed,
      balance: totalReceived - totalDisbursed,
    };
  }
  async payAllBills(tenantUuid: string, dto: { student_id: string; payment_method: string; pin?: string }) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.student_id, tenant_uuid: tenantUuid },
    });
    if (!student) throw new NotFoundException('Santri tidak ditemukan');

    const bills = await this.prisma.bill.findMany({
      where: {
        student_id: dto.student_id,
        tenant_uuid: tenantUuid,
        status: { in: ['pending', 'partial'] },
      },
    });

    if (bills.length === 0) throw new BadRequestException('Tidak ada tagihan aktif untuk santri ini');

    const totalAmount = bills.reduce((acc, b) => acc + (Number(b.amount) - Number(b.amount_paid)), 0);

    return await this.prisma.$transaction(async (tx) => {
      // PIN validation if paying with wallet balance
      if (dto.payment_method === 'saldo_santri') {
        const wallet = await tx.wallet.findUnique({ where: { student_id: dto.student_id } });
        if (!wallet || Number(wallet.balance) < totalAmount) {
          throw new BadRequestException('Saldo santri tidak mencukupi');
        }
        if (!dto.pin) throw new BadRequestException('PIN diperlukan untuk pembayaran dengan saldo');
        if (!wallet.pin) throw new BadRequestException('PIN dompet belum diatur');
        const isValid = await bcrypt.compare(dto.pin, wallet.pin);
        if (!isValid) throw new BadRequestException('PIN tidak sesuai');

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalAmount } },
        });

        await tx.walletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: wallet.id,
            type: 'payment',
            amount: new Prisma.Decimal(totalAmount),
            balance_before: wallet.balance,
            balance_after: new Prisma.Decimal(Number(wallet.balance) - totalAmount),
            reference: `PAY-ALL-${Date.now()}`,
            description: `Pembayaran ${bills.length} tagihan sekaligus`,
          },
        });
      }

      for (const bill of bills) {
        const remaining = Number(bill.amount) - Number(bill.amount_paid);
        await tx.bill.update({
          where: { id: bill.id },
          data: { amount_paid: bill.amount, status: 'paid' },
        });

        await tx.transaction.create({
          data: {
            tenant_uuid: tenantUuid,
            reference_no: `PAY-${bill.id}-${uuidv4().slice(0, 8)}`,
            student_id: dto.student_id,
            bill_id: bill.id,
            fee_category_id: bill.fee_category_id,
            amount_paid: new Prisma.Decimal(remaining),
            payment_method: dto.payment_method,
            status: 'success',
          },
        });
      }

      return { paid_bills_count: bills.length, total_paid: totalAmount };
    });
  }



  async notifyBills(tenantUuid: string, billIds: string[]) {
    const bills = await this.prisma.bill.findMany({
      where: {
        tenant_uuid: tenantUuid,
        id: { in: billIds },
      },
      include: {
        student: true,
        fee_category: true,
      },
    });

    const waStatus = this.whatsapp.getStatus(tenantUuid);
    const waSettings = await this.whatsapp.getSettings(tenantUuid);
    
    // Validate WA setup
    if (waSettings.provider === 'FONNTE' && !waSettings.fonnte_token) {
      throw new BadRequestException('WhatsApp Fonnte belum dikonfigurasi (Token Kosong)');
    }
    if (waSettings.provider === 'BAILEYS' && waStatus.status !== 'CONNECTED') {
      throw new BadRequestException('WhatsApp belum terhubung. Silakan hubungkan WhatsApp terlebih dahulu di menu Pengaturan.');
    }

    const results = {
      total: bills.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const bill of bills) {
      try {
        const phone = bill.student.parent_phone;
        if (!phone) {
          results.failed++;
          results.errors.push(`Santri ${bill.student.name}: Nomor WA orang tua tidak ada`);
          continue;
        }

        const amount = Number(bill.amount) - Number(bill.amount_paid);
        const message = `*TAGIHAN PEMBAYARAN*\n\nAssalamu'alaikum Warahmatullahi Wabarakatuh,\n\nInformasi tagihan untuk santri:\nNama: *${bill.student.name}*\nNIS: *${bill.student.nis}*\nKategori: *${bill.fee_category.name}*\nPeriode: *${bill.period || '-'}*\nSisa Tagihan: *Rp ${amount.toLocaleString('id-ID')}*\nJatuh Tempo: *${bill.due_date.toLocaleDateString('id-ID')}*\n\nMohon segera melakukan pembayaran. Terima kasih.\n\n_Pesan otomatis dari Sistem Pesantren_`;

        await this.whatsapp.sendMessage(phone, message, tenantUuid);
        
        await this.prisma.bill.update({
          where: { id: bill.id },
          data: { notified_at: new Date() } as any,
        });

        results.success++;
      } catch (err) {
        this.logger.error(`Failed to notify bill ${bill.id}`, err.stack);
        results.failed++;
        results.errors.push(`Santri ${bill.student.name}: ${err.message}`);
      }
    }

    return results;
  }
}
