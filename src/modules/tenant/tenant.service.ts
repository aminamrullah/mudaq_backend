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
  ) {}

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

    // Calculate expired_at if trial
    if (
      tenantData.subscription_status === 'trial' ||
      !tenantData.subscription_status
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

    return this.prisma.$transaction(async (tx) => {
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
      },
    });

    if (!tenant) throw new NotFoundException('Pesantren tidak ditemukan');

    // Aggregate revenue
    const topupRevenue = await this.prisma.topupLog.aggregate({
      where: { tenant_uuid: id, status: 'success' },
      _sum: { platform_fee: true },
    });

    return {
      ...tenant,
      revenue_summary: {
        total_platform_fee: topupRevenue._sum.platform_fee || 0,
      },
    };
  }

  async recordUsage(id: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await this.prisma.pesantren.findUnique({
      where: { id },
      include: { _count: { select: { students: true } } },
    });

    if (!stats) return;

    return this.prisma.usageLog.upsert({
      where: {
        tenant_uuid_date: {
          tenant_uuid: id,
          date: today,
        },
      },
      update: { student_count: stats._count.students },
      create: {
        tenant_uuid: id,
        date: today,
        student_count: stats._count.students,
      },
    });
  }
  async generateInvoice(id: string) {
    const tenant = await this.prisma.pesantren.findUnique({
      where: { id },
      include: { _count: { select: { students: true } } },
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
      amount = Number(tenant.price_per_student) * tenant._count.students;
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
                  <div class="logo">Pesantren SaaS</div>
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
                          <td>Biaya Sewa Penggunaan Aplikasi Pesantren (SaaS)</td>
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


  async findAllInvoices() {
    return this.prisma.saasInvoice.findMany({
      include: { pesantren: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async findInvoicesByTenant(tenantUuid: string) {
    return this.prisma.saasInvoice.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findOne(id);
    return this.prisma.pesantren.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.pesantren.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findActivitiesByTenant(tenantUuid: string) {
    return this.prisma.userActivity.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    });
  }
}
