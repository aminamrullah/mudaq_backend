import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrollDto } from './dto/payroll.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  constructor(private prisma: PrismaService) {}

  async create(tenantUuid: string, dto: CreatePayrollDto) {
    const existing = await this.prisma.payroll.findFirst({
      where: { tenant_uuid: tenantUuid, period: dto.period },
    });
    if (existing)
      throw new BadRequestException(
        `Payroll untuk periode ${dto.period} sudah ada`,
      );

    let totalAmount = 0;
    const items = dto.items || [];
    const itemsData = items.map((item) => {
      const total =
        item.base_salary + (item.allowances || 0) - (item.deductions || 0);
      totalAmount += total;
      return {
        tenant_uuid: tenantUuid,
        user_id: item.user_id,
        teacher_id: item.teacher_id || null,
        base_salary: new Prisma.Decimal(item.base_salary),
        allowances: new Prisma.Decimal(item.allowances || 0),
        deductions: new Prisma.Decimal(item.deductions || 0),
        total: new Prisma.Decimal(total),
        notes: item.notes,
      };
    });

    const payroll = await this.prisma.payroll.create({
      data: {
        tenant_uuid: tenantUuid,
        period: dto.period,
        notes: dto.notes,
        total_amount: new Prisma.Decimal(totalAmount),
        items: { create: itemsData },
      },
      include: { 
        items: { 
          include: { 
            user: { select: { name: true, role: true } },
            teacher: { select: { name: true } } 
          } 
        } 
      },
    });

    this.logger.log(
      `Payroll created: ${dto.period} with ${items.length} items, total: ${totalAmount}`,
    );
    return payroll;
  }

  async generateDraft(tenantUuid: string, dto: { period: string; notes?: string }) {
    const existing = await this.prisma.payroll.findFirst({
      where: { tenant_uuid: tenantUuid, period: dto.period },
    });
    if (existing) {
      throw new BadRequestException(`Payroll untuk periode ${dto.period} sudah ada`);
    }

    // Parse period (e.g. 2026-05) to get start and end dates
    const [yearStr, monthStr] = dto.period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Helper to count day occurrences in a month
    const countDayOccurrences = (y: number, m: number, dayOfWeek: number) => {
      let count = 0;
      const date = new Date(y, m, 1);
      while (date.getMonth() === m) {
        if (date.getDay() === dayOfWeek) count++;
        date.setDate(date.getDate() + 1);
      }
      return count;
    };

    // Fetch all employees
    const users = await this.prisma.user.findMany({
      where: {
        tenant_uuid: tenantUuid,
        is_active: true,
        role: { in: ['USTAD', 'STAFF_PESANTREN', 'FINANCE_PESANTREN', 'ADMIN_PESANTREN'] },
      },
      include: { 
        teacher: {
          include: { 
            schedules: true,
            attendances: {
              where: {
                date: { gte: startDate, lte: endDate },
                status: 'hadir'
              }
            }
          }
        } 
      },
    });

    let totalAmount = 0;
    const itemsData = [];

    for (const user of users) {
      const baseSalary = Number(user.base_salary) || 0;
      let deduction = 0;
      let notes = `Gaji Pokok: ${user.role}`;

      if (user.role === 'USTAD' && user.teacher) {
        const schedules = user.teacher.schedules || [];
        let expectedMeetings = 0;
        for (const s of schedules) {
          expectedMeetings += countDayOccurrences(year, month, s.day_of_week);
        }

        if (expectedMeetings > 0) {
          const actualMeetings = user.teacher.attendances.length;
          const missingMeetings = Math.max(0, expectedMeetings - actualMeetings);
          const ratePerMeeting = baseSalary / expectedMeetings;
          deduction = missingMeetings * ratePerMeeting;
          
          notes = `Hadir: ${actualMeetings}/${expectedMeetings}. Potongan: ${missingMeetings} x Rp${Math.round(ratePerMeeting).toLocaleString('id-ID')}`;
        }
      }

      const total = baseSalary - deduction;
      totalAmount += total;
      
      itemsData.push({
        tenant_uuid: tenantUuid,
        user_id: user.id,
        teacher_id: user.teacher?.id || null,
        base_salary: new Prisma.Decimal(baseSalary),
        allowances: new Prisma.Decimal(0),
        deductions: new Prisma.Decimal(deduction),
        total: new Prisma.Decimal(total),
        notes: notes,
      });
    }

    const payroll = await this.prisma.payroll.create({
      data: {
        tenant_uuid: tenantUuid,
        period: dto.period,
        notes: dto.notes || `Generated draft based on salary settings & attendance`,
        total_amount: new Prisma.Decimal(totalAmount),
        items: { create: itemsData },
      },
      include: { 
        items: { 
          include: { 
            user: { select: { name: true, role: true } },
            teacher: { select: { name: true } } 
          } 
        } 
      },
    });

    this.logger.log(`Generated Draft Payroll ${dto.period} with ${itemsData.length} items`);
    return payroll;
  }

  async updateItem(tenantUuid: string, itemId: string, dto: { allowances?: number; deductions?: number; notes?: string }) {
    const item = await this.prisma.payrollItem.findFirst({
      where: { id: itemId, tenant_uuid: tenantUuid },
      include: { payroll: true }
    });
    if (!item) throw new NotFoundException('Item payroll tidak ditemukan');
    if (item.payroll.status !== 'draft') throw new BadRequestException('Hanya payroll draft yang bisa diubah');

    const allowances = dto.allowances !== undefined ? dto.allowances : Number(item.allowances);
    const deductions = dto.deductions !== undefined ? dto.deductions : Number(item.deductions);
    const total = Number(item.base_salary) + allowances - deductions;

    const updatedItem = await this.prisma.payrollItem.update({
      where: { id: itemId },
      data: {
        allowances: new Prisma.Decimal(allowances),
        deductions: new Prisma.Decimal(deductions),
        total: new Prisma.Decimal(total),
        notes: dto.notes || item.notes
      }
    });

    // Recalculate total amount for the whole payroll
    const allItems = await this.prisma.payrollItem.findMany({
      where: { payroll_id: item.payroll_id }
    });
    const newTotalAmount = allItems.reduce((sum, i) => sum + Number(i.total), 0);

    await this.prisma.payroll.update({
      where: { id: item.payroll_id },
      data: { total_amount: new Prisma.Decimal(newTotalAmount) }
    });

    return updatedItem;
  }

  async findAll(tenantUuid: string, page = 1, limit = 20) {
    const where = { tenant_uuid: tenantUuid };
    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { items: true } } },
        orderBy: { period: 'desc' },
      }),
      this.prisma.payroll.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantUuid: string, id: string) {
    const payroll = await this.prisma.payroll.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        items: {
          include: {
            user: { select: { name: true, role: true, email: true, phone: true } },
            teacher: { select: { name: true, nip: true, phone: true } },
          },
          orderBy: { user: { name: 'asc' } }
        },
      },
    });
    if (!payroll) throw new NotFoundException('Payroll tidak ditemukan');
    return payroll;
  }

  async approve(tenantUuid: string, id: string, userId: string) {
    const payroll = await this.findOne(tenantUuid, id);
    if (payroll.status !== 'draft')
      throw new BadRequestException('Hanya payroll draft yang bisa disetujui');
    return this.prisma.payroll.update({
      where: { id },
      data: { status: 'approved', approved_by: userId },
    });
  }

  async markPaid(tenantUuid: string, id: string) {
    const payroll = await this.findOne(tenantUuid, id);
    if (payroll.status !== 'approved')
      throw new BadRequestException('Payroll harus disetujui terlebih dahulu');
    
    return this.prisma.$transaction(async (tx) => {
      // 1. Update payroll status
      const updatedPayroll = await tx.payroll.update({
        where: { id },
        data: { status: 'paid', paid_at: new Date() },
      });

      // 2. Create financial expenditure record
      await tx.expenditure.create({
        data: {
          tenant_uuid: tenantUuid,
          title: `Payroll Periode ${payroll.period}`,
          amount: payroll.total_amount,
          category: 'Payroll',
          description: `Pembayaran gaji karyawan untuk periode ${payroll.period}. Total ${payroll.items.length} penerima.`,
          date: new Date(),
          payment_method: 'cash'
        }
      });

      return updatedPayroll;
    });
  }
}
