import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { XenditService } from './xendit.service';
import { GlobalConfigService } from '../global-config/global-config.service';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private prisma: PrismaService,
    private xendit: XenditService,
    private globalConfig: GlobalConfigService,
  ) { }

  async create(dto: CreateTenantDto) {
    if (!dto.slug) {
      const baseSlug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const randomStr = Math.random().toString(36).substring(2, 6);
      dto.slug = `${baseSlug}-${randomStr}`;
    }

    const existing = await this.prisma.pesantren.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Slug pesantren sudah digunakan');

    const { admin_name, admin_email, admin_password, ...tenantData } = dto;

    // Xendit sub-account is now managed manually by SuperAdmin to avoid spam/unnecessary costs
    // The xendit_sub_account_id should be provided manually in the form if needed.

    // Format date if string YYYY-MM-DD to avoid Prisma error
    if (tenantData.expired_at === '') {
      (tenantData as any).expired_at = null;
    } else if (tenantData.expired_at && typeof tenantData.expired_at === 'string' && tenantData.expired_at.length === 10) {
      (tenantData as any).expired_at = new Date(`${tenantData.expired_at}T00:00:00Z`);
    }

    // Calculate expired_at if trial and not provided
    if (
      (tenantData.subscription_status === 'trial' ||
        !tenantData.subscription_status) &&
      !tenantData.expired_at
    ) {
      const globalTrialDays = await this.globalConfig.getValue(
        'default_trial_duration_days',
        '14',
      );
      const trialDays =
        tenantData.trial_duration_days || parseInt(globalTrialDays);
      const expiredAt = new Date();
      expiredAt.setDate(expiredAt.getDate() + trialDays);
      (tenantData as any).expired_at = expiredAt;
      (tenantData as any).trial_duration_days = trialDays;
    }

    // Auto-calculate expired_at when status is active and not provided manually
    if (tenantData.subscription_status === 'active' && !tenantData.expired_at) {
      const cycle = tenantData.billing_cycle || 'monthly';
      const expiredAt = new Date();
      if (cycle === 'yearly') {
        expiredAt.setFullYear(expiredAt.getFullYear() + 1);
      } else {
        expiredAt.setMonth(expiredAt.getMonth() + 1);
      }
      (tenantData as any).expired_at = expiredAt;
    }

    return this.prisma.$transaction(async (tx) => {
      if (tenantData.storage_limit !== undefined) {
        (tenantData as any).storage_limit = BigInt(Math.round(Number(tenantData.storage_limit)));
      }

      const tenant = await tx.pesantren.create({
        data: {
          ...tenantData,
          slug: dto.slug!,
        } as any,
      });

      if (admin_email && admin_password) {
        await tx.user.create({
          data: {
            tenant_uuid: tenant.id,
            name: admin_name || tenant.name,
            email: admin_email,
            password: await bcrypt.hash(admin_password, 12),
            role: Role.ADMIN_PESANTREN,
          },
        });
      }

      this.logger.log(`Tenant created: ${tenant.name} (${tenant.id})`);
      return tenant;
    });
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const where: any = { deleted_at: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.pesantren.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { students: true, users: true, teachers: true } },
        },
      }),
      this.prisma.pesantren.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.pesantren.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: true,
            users: true,
            teachers: true,
            classrooms: true,
            koperasi_outlets: true,
            products: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            is_active: true,
            created_at: true,
          },
          orderBy: { role: 'asc' },
        },
        topup_logs: {
          where: { status: 'success' },
          orderBy: { created_at: 'desc' },
          take: 50,
          select: {
            id: true,
            amount: true,
            platform_fee: true,
            surcharge_fee: true,
            xendit_fee: true,
            net_amount: true,
            created_at: true,
            external_id: true,
          },
        },
        saas_invoices: { orderBy: { created_at: 'desc' }, take: 10 },
        usage_logs: { orderBy: { date: 'desc' }, take: 30 },
        tenant_wallet: true,
      },
    });

    if (!tenant) throw new NotFoundException('Pesantren tidak ditemukan');

    // Aggregate revenue
    const topupRevenue = await this.prisma.topupLog.aggregate({
      where: { tenant_uuid: id, status: 'success' },
      _sum: { platform_fee: true },
    });

    // Koperasi Stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [koperasiTotal, koperasi30d] = await Promise.all([
      this.prisma.posOrder.aggregate({
        where: { tenant_uuid: id, status: 'completed' },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.posOrder.aggregate({
        where: {
          tenant_uuid: id,
          status: 'completed',
          created_at: { gte: thirtyDaysAgo },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    return {
      ...tenant,
      revenue_summary: {
        total_platform_fee: topupRevenue._sum.platform_fee || 0,
      },
      koperasi_summary: {
        total_sales: koperasiTotal._sum.total || 0,
        total_orders: koperasiTotal._count.id || 0,
        sales_30d: koperasi30d._sum.total || 0,
        orders_30d: koperasi30d._count.id || 0,
      },
    };
  }

  // Helper for deduplicating multi-unit students (Virtual Grouping)
  async getUniqueStudentCount(tenantUuid: string, statusFilter?: any) {
    const where: any = { tenant_uuid: tenantUuid, deleted_at: null };
    if (statusFilter) {
      where.status = statusFilter;
    }

    const students = await this.prisma.student.findMany({
      where,
      select: { nik: true, name: true, birth_date: true },
    });

    const uniqueSet = new Set<string>();
    for (const s of students) {
      const key = (s.nik && s.nik.trim() !== '') 
        ? s.nik 
        : `${s.name.toLowerCase()}_${s.birth_date ? new Date(s.birth_date).getTime() : ''}`;
      uniqueSet.add(key);
    }

    return uniqueSet.size;
  }

  async recordUsage(id: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await this.prisma.pesantren.findUnique({
      where: { id },
    });

    if (!stats) return;
    const uniqueCount = await this.getUniqueStudentCount(id);

    return this.prisma.usageLog.upsert({
      where: {
        tenant_uuid_date: {
          tenant_uuid: id,
          date: today,
        },
      },
      update: { student_count: uniqueCount },
      create: {
        tenant_uuid: id,
        date: today,
        student_count: uniqueCount,
      },
    });
  }
  async generateInvoice(id: string) {
    const tenant = await this.prisma.pesantren.findUnique({
      where: { id },
    });

    if (!tenant) throw new NotFoundException('Pesantren tidak ditemukan');

    const now = new Date();
    const period =
      tenant.billing_cycle === 'yearly'
        ? `${now.getFullYear()}`
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let amount = 0;
    if (tenant.billing_type === 'fixed') {
      amount = Number(tenant.fixed_billing_amount);
    } else {
      const uniqueCount = await this.getUniqueStudentCount(id);
      amount = Number(tenant.price_per_student) * uniqueCount;
    }

    // If yearly, we might want to multiply by 12 if the price entered was monthly,
    // but usually in SaaS, the "fixed_amount" for yearly is a different set price.
    // We'll stick to the configured value.

    // Due date logic
    const dueDate = new Date();
    const daysToAdd = tenant.billing_cycle === 'yearly' ? 14 : 7;
    dueDate.setDate(dueDate.getDate() + daysToAdd);

    const existing = await this.prisma.saasInvoice.findFirst({
      where: { tenant_uuid: id, period },
    });

    if (existing) {
      return this.prisma.saasInvoice.update({
        where: { id: existing.id },
        data: { amount },
      });
    }

    return this.prisma.saasInvoice.create({
      data: {
        tenant_uuid: id,
        period,
        amount,
        due_date: dueDate,
        status: 'unpaid',
      },
    });
  }

  async generateAllInvoices() {
    const activeTenants = await this.prisma.pesantren.findMany({
      where: { subscription_status: 'active', deleted_at: null },
    });

    const results = [];
    for (const tenant of activeTenants) {
      try {
        const inv = await this.generateInvoice(tenant.id);
        results.push({ tenant: tenant.name, status: 'success', invoiceId: inv.id });
      } catch (err) {
        results.push({ tenant: tenant.name, status: 'failed', error: err.message });
      }
    }
    return results;
  }

  async updateInvoiceStatus(id: string, status: string) {
    const invoice = await this.prisma.saasInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');

    return this.prisma.saasInvoice.update({
      where: { id },
      data: {
        status,
        paid_at: status === 'paid' ? new Date() : null,
      },
    });
  }

  async getInvoiceHtml(id: string) {
    const invoice = await this.prisma.saasInvoice.findUnique({
      where: { id },
      include: { pesantren: true },
    });

    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');

    const amount = Number(invoice.amount).toLocaleString('id-ID');
    const date = new Date(invoice.created_at).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const dueDate = new Date(invoice.due_date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const paidAt = invoice.paid_at
      ? new Date(invoice.paid_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      : null;

    return `
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <title>Invoice ${invoice.period} - ${invoice.pesantren.name}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 40px; background: #f9f9f9; }
              .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); border-radius: 8px; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px; }
              .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
              .invoice-info { text-align: right; }
              table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; margin-top: 20px; }
              table th { background: #f3f4f6; padding: 12px; border: 1px solid #eee; }
              table td { padding: 12px; border: 1px solid #eee; }
              .total { margin-top: 20px; text-align: right; font-size: 20px; font-weight: bold; }
              .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
              .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; text-transform: uppercase; font-size: 12px; }
              .paid { background: #dcfce7; color: #166534; }
              .unpaid { background: #fef9c3; color: #854d0e; }
              @media print {
                  body { background: none; padding: 0; }
                  .invoice-box { box-shadow: none; border: none; }
                  .no-print { display: none; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="text-align: center; margin-bottom: 20px;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Cetak Invoice / Simpan PDF</button>
          </div>
          <div class="invoice-box">
              <div class="header">
                  <div class="logo">MUDAQ</div>
                  <div class="invoice-info">
                      <div style="font-size: 18px; font-weight: bold;">INVOICE</div>
                      <div>ID: #${invoice.id.substring(0, 8).toUpperCase()}</div>
                      <div>Tanggal: ${date}</div>
                  </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                  <div>
                      <div style="font-weight: bold; color: #666;">DITAGIHKAN KEPADA:</div>
                      <div style="font-size: 18px; font-weight: bold; margin: 5px 0;">${invoice.pesantren.name}</div>
                      <div>${invoice.pesantren.address || '-'}</div>
                      <div>Email: ${invoice.pesantren.email || '-'}</div>
                      <div>Telp: ${invoice.pesantren.phone || '-'}</div>
                  </div>
                  <div style="text-align: right;">
                      <div style="font-weight: bold; color: #666;">DIBAYAR KEPADA:</div>
                      <div style="font-size: 18px; font-weight: bold; margin: 5px 0;">Moh Amin Amrullah</div>
                      <div>Admin Platform Digitalisasi Pesantren</div>
                      <div>Telp/WA: 0831-8665-2455</div>
                  </div>
              </div>

              <table>
                  <thead>
                      <tr>
                          <th>Deskripsi Layanan</th>
                          <th style="text-align: center;">Periode</th>
                          <th style="text-align: right;">Total</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td>Biaya Penggunaan Aplikasi Pesantren MUDAQ</td>
                          <td style="text-align: center;">${invoice.period}</td>
                          <td style="text-align: right;">Rp ${amount}</td>
                      </tr>
                  </tbody>
              </table>

              <div class="total">
                  Total Tagihan: Rp ${amount}
              </div>

              <div style="margin-top: 30px;">
                  <div style="font-weight: bold;">Status Pembayaran:</div>
                  <div class="status-badge ${invoice.status}">
                      ${invoice.status === 'paid' ? 'LUNAS' : 'BELUM DIBAYAR'}
                  </div>
                  ${paidAt ? `<div style="font-size: 12px; margin-top: 5px;">Dibayar pada: ${paidAt}</div>` : ''}
              </div>

              <div style="margin-top: 40px; padding: 15px; background: #f8fafc; border-radius: 5px; font-size: 13px;">
                  <strong>Metode Pembayaran:</strong><br>
                  Bank BRI<br>
                  No. Rekening: 7514 0100 6686 531<br>
                  Atas Nama: Moh Amin Amrullah
              </div>

              <div class="footer">
                  Terima kasih atas kepercayaan Anda menggunakan layanan kami.<br>
                  Invoice ini dihasilkan secara otomatis oleh sistem dan sah tanpa tanda tangan basah.
              </div>
          </div>
      </body>
      </html>
    `;
  }


  async findAllInvoices(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.saasInvoice.findMany({
        include: { pesantren: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.saasInvoice.count(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findInvoicesByTenant(tenantUuid: string, page = 1, limit = 20) {
    const where = { tenant_uuid: tenantUuid };
    const [data, total] = await Promise.all([
      this.prisma.saasInvoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.saasInvoice.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const current = await this.prisma.pesantren.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pesantren tidak ditemukan');

    const data: any = { ...dto };

    // Fix: Handle empty string or invalid date format to avoid Prisma error
    if (data.expired_at === '') {
      data.expired_at = null;
    } else if (data.expired_at && typeof data.expired_at === 'string' && data.expired_at.length === 10) {
      data.expired_at = new Date(`${data.expired_at}T00:00:00Z`);
    }

    // Auto-calculate expired_at when status changes to active and not provided manually
    if (
      data.subscription_status === 'active' &&
      current.subscription_status !== 'active' &&
      !data.expired_at
    ) {
      const cycle = data.billing_cycle || current.billing_cycle;
      const expiredAt = new Date();
      if (cycle === 'yearly') {
        expiredAt.setFullYear(expiredAt.getFullYear() + 1);
      } else {
        expiredAt.setMonth(expiredAt.getMonth() + 1);
      }
      data.expired_at = expiredAt;
    }

    if (data.storage_limit !== undefined) {
      data.storage_limit = BigInt(Math.round(Number(data.storage_limit)));
    }

    return this.prisma.pesantren.update({ where: { id }, data });
  }

  async remove(id: string) {
    const tenant = await this.findOne(id);
    const timestamp = Date.now();
    
    // Ambil semua user yang terafiliasi dengan pesantren ini
    const users = await this.prisma.user.findMany({
      where: { tenant_uuid: id, deleted_at: null },
      select: { id: true, phone: true, email: true }
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Hapus (Soft-Delete) Pesantren
      const deletedTenant = await tx.pesantren.update({
        where: { id },
        data: { 
          deleted_at: new Date(),
          slug: tenant.slug ? `${tenant.slug}-del-${timestamp}` : undefined,
          domain: tenant.domain ? `${tenant.domain}-del-${timestamp}` : undefined,
        },
      });

      // 2. Hapus (Soft-Delete) semua User terkait
      for (const user of users) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            deleted_at: new Date(),
            is_active: false,
            phone: user.phone ? `${user.phone}_del_${timestamp}` : null,
            email: user.email ? `${user.email}_del_${timestamp}` : null,
          }
        });
      }

      // 3. Hapus (Soft-Delete) semua Santri
      await tx.student.updateMany({
        where: { tenant_uuid: id, deleted_at: null },
        data: { deleted_at: new Date() }
      });

      return deletedTenant;
    });
  }

  async findActivitiesByTenant(tenantUuid: string, page = 1, limit = 20) {
    const where = { tenant_uuid: tenantUuid };
    const [data, total] = await Promise.all([
      this.prisma.userActivity.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { name: true, email: true, role: true } },
        },
      }),
      this.prisma.userActivity.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findTransactionsByTenant(tenantUuid: string, page = 1, limit = 20) {
    const txs = await this.prisma.transaction.findMany({
      where: { tenant_uuid: tenantUuid, status: 'success', payment_method: 'payment_gateway' },
      orderBy: { payment_date: 'desc' }
    });
    
    const topups = await this.prisma.topupLog.findMany({
      where: { tenant_uuid: tenantUuid, status: 'success' },
      orderBy: { created_at: 'desc' }
    });

    const combined = [
      ...txs.map(t => ({
        id: t.id,
        external_id: t.reference_no,
        amount: t.amount_paid,
        platform_fee: t.platform_fee,
        surcharge_fee: t.surcharge_fee,
        xendit_fee: t.xendit_fee,
        net_amount: t.net_amount,
        created_at: t.payment_date,
        type: 'TRANSACTION'
      })),
      ...topups.map(t => ({
        id: t.id,
        external_id: t.external_id,
        amount: t.amount,
        platform_fee: t.platform_fee,
        surcharge_fee: t.surcharge_fee,
        xendit_fee: t.xendit_fee,
        net_amount: t.net_amount,
        created_at: t.created_at,
        type: 'TOPUP'
      }))
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const total = combined.length;
    const paginated = combined.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
