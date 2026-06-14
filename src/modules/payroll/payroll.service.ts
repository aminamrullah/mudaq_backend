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

    // Fetch all active employees
    const users = await this.prisma.user.findMany({
      where: {
        tenant_uuid: tenantUuid,
        is_active: true,
      },
      include: { 
        teacher: {
          include: { 
            attendances: {
              where: {
                date: { gte: startDate, lte: endDate },
                status: 'hadir'
              }
            }
          }
        },
        work_attendances: {
          where: {
            date: { gte: startDate, lte: endDate },
            status: 'hadir'
          }
        },
        work_overtimes: {
          where: {
            date: { gte: startDate, lte: endDate },
            status: 'approved'
          }
        }
      },
    });

    let totalAmount = 0;
    const itemsData = [];

    for (const user of users) {
      const baseSalary = Number(user.base_salary) || 0;
      const workAttendanceRate = Number((user as any).work_attendance_rate) || 0;
      const overtimeRate = Number((user as any).overtime_rate) || 0;
      const teachingRate = user.teacher ? (Number((user.teacher as any).teaching_attendance_rate) || 0) : 0;

      const workAttendanceCount = (user as any).work_attendances?.length || 0;
      const workAttendanceAllowance = workAttendanceCount * workAttendanceRate;
      
      let totalOvertimeHours = 0;
      const overtimes = (user as any).work_overtimes || [];
      for (const ot of overtimes) {
        totalOvertimeHours += Number(ot.duration_hours);
      }
      const overtimeAllowance = totalOvertimeHours * overtimeRate;

      let teachingAllowance = 0;
      const teachingCount = user.teacher?.attendances?.length || 0;
      if (user.teacher) {
        teachingAllowance = teachingCount * teachingRate;
      }

      const totalAllowances = workAttendanceAllowance + overtimeAllowance + teachingAllowance;
      
      let notes = `Gaji Pokok: Rp${baseSalary.toLocaleString('id-ID')}`;
      if (workAttendanceAllowance > 0) notes += ` | Hadir Kerja: ${workAttendanceCount}x = Rp${workAttendanceAllowance.toLocaleString('id-ID')}`;
      if (overtimeAllowance > 0) notes += ` | Lembur: ${totalOvertimeHours}j = Rp${overtimeAllowance.toLocaleString('id-ID')}`;
      if (teachingAllowance > 0) notes += ` | Mengajar: ${teachingCount}x = Rp${teachingAllowance.toLocaleString('id-ID')}`;

      const total = baseSalary + totalAllowances;
      totalAmount += total;
      
      itemsData.push({
        tenant_uuid: tenantUuid,
        user_id: user.id,
        teacher_id: user.teacher?.id || null,
        base_salary: new Prisma.Decimal(baseSalary),
        allowances: new Prisma.Decimal(totalAllowances),
        deductions: new Prisma.Decimal(0),
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

  async payItem(tenantUuid: string, itemId: string, dto: { paymentMethod: 'cash' | 'wallet' }) {
    const item = await this.prisma.payrollItem.findFirst({
      where: { id: itemId, tenant_uuid: tenantUuid },
      include: { payroll: true, user: { select: { name: true } }, teacher: { select: { name: true } } }
    });
    
    if (!item) throw new NotFoundException('Item payroll tidak ditemukan');
    if (item.payroll.status !== 'approved') throw new BadRequestException('Payroll belum disetujui');
    if (item.payment_status === 'paid') throw new BadRequestException('Gaji ini sudah dibayarkan');

    return this.prisma.$transaction(async (tx) => {
      const amount = new Prisma.Decimal(item.total);

      if (dto.paymentMethod === 'wallet') {
        if (amount.lessThanOrEqualTo(0)) {
          throw new BadRequestException('Gaji bernilai 0 atau negatif tidak dapat dibayarkan via Wallet.');
        }
        // 1. Check Tenant Wallet Balance
        const tenantWallet = await tx.tenantWallet.findUnique({
          where: { tenant_uuid: tenantUuid },
        });
        const pesantren = await tx.pesantren.findUnique({ where: { id: tenantUuid } });
        const minBalance = Number(pesantren?.min_tenant_wallet_balance || 0);

        if (!tenantWallet || Number(tenantWallet.balance) - Number(amount) < minBalance) {
          throw new BadRequestException('Saldo Induk Pesantren tidak mencukupi untuk transfer gaji.');
        }

        // 2. Get or Create User Wallet
        let userWallet = await tx.userWallet.findFirst({
          where: { tenant_uuid: tenantUuid, user_id: item.user_id },
        });

        if (!userWallet) {
          userWallet = await tx.userWallet.create({
            data: { tenant_uuid: tenantUuid, user_id: item.user_id, balance: 0 },
          });
        }

        // 3. Move Funds
        const tenantBalanceBefore = tenantWallet.balance;
        const tenantBalanceAfter = Prisma.Decimal.sub(tenantBalanceBefore, amount);
        const userBalanceBefore = userWallet.balance;
        const userBalanceAfter = Prisma.Decimal.add(userBalanceBefore, amount);

        await tx.tenantWallet.update({
          where: { id: tenantWallet.id },
          data: { balance: tenantBalanceAfter },
        });

        await tx.userWallet.update({
          where: { id: userWallet.id },
          data: { balance: userBalanceAfter },
        });

        // 4. Log Transactions
        await tx.tenantWalletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            type: 'withdraw',
            amount,
            balance_before: tenantBalanceBefore,
            balance_after: tenantBalanceAfter,
            reference: `PAY-${item.payroll.period}`,
            description: `Pembayaran gaji via dompet ke User ID: ${item.user_id}`,
          },
        });

        await tx.userWalletTransaction.create({
          data: {
            tenant_uuid: tenantUuid,
            wallet_id: userWallet.id,
            type: 'salary',
            amount,
            balance_before: userBalanceBefore,
            balance_after: userBalanceAfter,
            reference: `PAY-${item.payroll.period}`,
            description: `Penerimaan gaji periode ${item.payroll.period}`,
          },
        });
      }

      // Create Expenditure record
      await tx.expenditure.create({
        data: {
          tenant_uuid: tenantUuid,
          title: `Gaji: ${item.user?.name || item.teacher?.name || 'Karyawan'} (${item.payroll.period})`,
          amount: amount,
          category: 'Payroll',
          description: `Pembayaran gaji periode ${item.payroll.period} via ${dto.paymentMethod}`,
          date: new Date(),
          payment_method: dto.paymentMethod
        }
      });

      // 5. Update Payroll Item
      const updatedItem = await tx.payrollItem.update({
        where: { id: itemId },
        data: {
          payment_status: 'paid',
          payment_method: dto.paymentMethod,
          paid_at: new Date(),
        },
      });

      // 6. Check if all items are paid, if so update Payroll status
      const allItems = await tx.payrollItem.findMany({
        where: { payroll_id: item.payroll_id },
      });
      const allPaid = allItems.every((i) => i.payment_status === 'paid');
      
      if (allPaid) {
        await tx.payroll.update({
          where: { id: item.payroll_id },
          data: { status: 'paid', paid_at: new Date() },
        });
      }

      return updatedItem;
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

      // Update all unpaid items to paid via cash
      const unpaidItems = await tx.payrollItem.findMany({
        where: { payroll_id: id, payment_status: 'pending' },
      });
      
      if (unpaidItems.length > 0) {
        const totalUnpaid = unpaidItems.reduce((sum, item) => sum + Number(item.total), 0);

        await tx.payrollItem.updateMany({
          where: { payroll_id: id, payment_status: 'pending' },
          data: { payment_status: 'paid', payment_method: 'cash', paid_at: new Date() },
        });

        // 2. Create financial expenditure record
        await tx.expenditure.create({
          data: {
            tenant_uuid: tenantUuid,
            title: `Payroll Periode ${payroll.period}`,
            amount: totalUnpaid,
            category: 'Payroll',
            description: `Pembayaran gaji karyawan (Cash) untuk periode ${payroll.period}. Total ${unpaidItems.length} penerima.`,
            date: new Date(),
            payment_method: 'cash'
          }
        });
      }

      return updatedPayroll;
    });
  }

  async findMyPayrolls(tenantUuid: string, userId: string) {
    return this.prisma.payrollItem.findMany({
      where: { tenant_uuid: tenantUuid, user_id: userId, payment_status: 'paid' },
      include: {
        payroll: true,
        user: { select: { name: true, role: true } },
        teacher: { select: { name: true } },
      },
      orderBy: { payroll: { period: 'desc' } },
    });
  }
}
