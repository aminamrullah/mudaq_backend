import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantUuid: string) {
    if (!tenantUuid) {
      return {
        students: { total: 0, active: 0 },
        teachers: 0,
        dormitories: 0,
        billing: { unpaid_bills: 0 },
        wallet: { total_balance: 0 },
        attendance_today: { hadir: 0, sakit: 0, izin: 0, alpha: 0 },
        recent_bills: [],
        recent_transactions: [],
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStudents,
      activeStudents,
      prospectiveStudents,
      totalTeachers,
      totalDormitories,
      unpaidBills,
      totalWalletBalance,
      todayAttendance,
      todayTeacherAttendance,
      recentBills,
      recentTransactions,
      recentSaasInvoices,
      totalIncome,
      totalExpenditure,
      totalPayroll,
      totalDisbursement,
      tenantInfo,
      pendingPermissionsCount,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { tenant_uuid: tenantUuid, deleted_at: null },
      }),
      this.prisma.student.count({
        where: { tenant_uuid: tenantUuid, status: { in: ['AKTIF', 'active'] }, deleted_at: null },
      }),
      this.prisma.student.count({
        where: { tenant_uuid: tenantUuid, status: 'CALON', deleted_at: null },
      }),
      this.prisma.teacher.count({
        where: { tenant_uuid: tenantUuid, deleted_at: null },
      }),
      this.prisma.dormitory.count({ where: { tenant_uuid: tenantUuid } }),
      this.prisma.bill.count({
        where: {
          tenant_uuid: tenantUuid,
          status: { in: ['pending', 'partial', 'overdue'] },
          student: { status: { in: ['AKTIF', 'active'] }, deleted_at: null },
        },
      }),
      this.prisma.wallet.aggregate({
        where: { tenant_uuid: tenantUuid },
        _sum: { balance: true },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { tenant_uuid: tenantUuid, date: today },
        _count: { _all: true },
      }),
      this.prisma.teacherAttendance.groupBy({
        by: ['status'],
        where: { tenant_uuid: tenantUuid, date: today },
        _count: { _all: true },
      }),
      this.prisma.bill.findMany({
        where: { 
          tenant_uuid: tenantUuid,
          student: { status: { in: ['AKTIF', 'active'] }, deleted_at: null }
        },
        include: {
          student: { select: { name: true, nis: true } },
          fee_category: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      this.prisma.transaction.findMany({
        where: { 
          tenant_uuid: tenantUuid,
          student: { status: { in: ['AKTIF', 'active'] }, deleted_at: null }
        },
        include: {
          student: { select: { name: true } },
          fee_category: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      this.prisma.saasInvoice.findMany({
        where: { tenant_uuid: tenantUuid },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      // Financial Aggregates
      this.prisma.transaction.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'success' },
        _sum: { amount_paid: true, net_amount: true },
      }),
      this.prisma.expenditure.aggregate({
        where: { tenant_uuid: tenantUuid },
        _sum: { amount: true },
      }),
      this.prisma.payroll.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'paid' },
        _sum: { total_amount: true },
      }),
      this.prisma.donationDisbursement.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'success' },
        _sum: { amount: true },
      }),
      this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { max_students: true }
      }),
      this.prisma.studentPermission.count({
        where: { tenant_uuid: tenantUuid, status: 'pending' }
      }),
    ]);

    // Process attendance data
    const attendanceMap: Record<string, number> = {
      hadir: 0,
      sakit: 0,
      izin: 0,
      alpha: 0,
    };
    todayAttendance.forEach((a) => {
      attendanceMap[a.status] = (a as any)._count._all || 0;
    });
    const teacherAttendanceMap: Record<string, number> = {
      hadir: 0,
      sakit: 0,
      izin: 0,
      alpha: 0,
    };
    todayTeacherAttendance.forEach((a) => {
      teacherAttendanceMap[a.status] = (a as any)._count._all || 0;
    });

    // Use net_amount if available (for new transactions), 
    // for old ones where net_amount might be 0, fallback to amount_paid for consistency
    const incomeSum = Number(totalIncome._sum.net_amount || totalIncome._sum.amount_paid || 0);
    const expenseSum = Number(totalExpenditure._sum.amount || 0);
    const payrollSum = Number(totalPayroll._sum.total_amount || 0);
    const disbursementSum = Number(totalDisbursement._sum.amount || 0);

    return {
      students: { 
        total: totalStudents, 
        active: activeStudents,
        prospective: prospectiveStudents,
        max_quota: tenantInfo?.max_students || 0,
      },
      teachers: totalTeachers,
      dormitories: totalDormitories,
      permissions: { pending_count: pendingPermissionsCount },
      billing: { unpaid_bills: unpaidBills },
      wallet: { total_balance: totalWalletBalance._sum.balance || 0 },
      attendance_today: attendanceMap,
      teacher_attendance_today: teacherAttendanceMap,
      recent_bills: recentBills,
      recent_transactions: recentTransactions.slice(0, 10),
      recent_saas_invoices: recentSaasInvoices,
      financial: {
        total_income: incomeSum,
        total_expense: expenseSum + payrollSum + disbursementSum,
        breakdown: {
          expenditure: expenseSum,
          payroll: payrollSum,
          disbursement: disbursementSum,
        },
      },
    };
  }

  async getSuperAdminStats() {
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      trialTenants,
      totalStudents,
      platformRevenue,
      saasInvoiceSummary,
      recentTenants,
      usageTrend,
    ] = await Promise.all([
      this.prisma.pesantren.count({ where: { deleted_at: null } }),
      this.prisma.pesantren.count({
        where: { subscription_status: 'active', deleted_at: null },
      }),
      this.prisma.pesantren.count({
        where: { subscription_status: 'suspended', deleted_at: null },
      }),
      this.prisma.pesantren.count({
        where: { subscription_status: 'trial', deleted_at: null },
      }),
      this.prisma.student.count({ where: { deleted_at: null } }),
      this.prisma.topupLog.aggregate({
        where: { status: 'success' },
        _sum: { platform_fee: true },
      }),
      this.prisma.saasInvoice.groupBy({
        by: ['status'],
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.pesantren.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          created_at: true,
          subscription_status: true,
        },
      }),
      this.prisma.usageLog.findMany({
        orderBy: { date: 'desc' },
        take: 15,
        select: { date: true, student_count: true },
      }),
    ]);

    const invoiceStats: Record<string, any> = {
      total_count: 0,
      total_amount: 0,
      by_status: {},
    };
    saasInvoiceSummary.forEach((s) => {
      const count = (s as any)._count._all || 0;
      invoiceStats.total_count += count;
      invoiceStats.total_amount += Number(s._sum.amount || 0);
      invoiceStats.by_status[s.status] = {
        count: count,
        amount: Number(s._sum.amount || 0),
      };
    });

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        suspended: suspendedTenants,
        trial: trialTenants,
      },
      students: { global_total: totalStudents },
      revenue: {
        platform_fees: Number(platformRevenue._sum.platform_fee || 0),
        saas_billing: invoiceStats,
      },
      recent_tenants: recentTenants,
      usage_trend: usageTrend.reverse(),
    };
  }

  async getTeacherStats(tenantUuid: string, userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...

    // 1. Get Teacher Profile via User relation
    const userWithTeacher = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teacher: {
          include: {
            classrooms: {
              where: { tenant_uuid: tenantUuid },
              include: {
                _count: { select: { students: true } }
              }
            }
          }
        }
      }
    });

    const teacher = userWithTeacher?.teacher;

    if (!teacher) return null;

    // 2. Fetch data in parallel
    const [
      schedules,
      todayAttendance,
      recentJournals,
      recentTahfidz,
      classAttendance
    ] = await Promise.all([
      // Schedules for today
      this.prisma.schedule.findMany({
        where: { tenant_uuid: tenantUuid, teacher_id: teacher.id, day_of_week: dayOfWeek },
        include: { subject: true, classroom: true },
        orderBy: { start_time: 'asc' }
      }),
      // Teacher's own attendance today
      this.prisma.teacherAttendance.findFirst({
        where: { tenant_uuid: tenantUuid, teacher_id: teacher.id, date: today }
      }),
      // Recent journals
      this.prisma.teachingJournal.findMany({
        where: { tenant_uuid: tenantUuid, teacher_id: teacher.id },
        include: { 
          schedule: {
            include: { subject: true, classroom: true }
          }
        },
        orderBy: { date: 'desc' },
        take: 5
      }),
      // Recent tahfidz received
      this.prisma.tahfidzRecord.findMany({
        where: { tenant_uuid: tenantUuid, teacher_id: teacher.id },
        include: { student: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: 5
      }),
      // If homeroom, get today's attendance for their class
      // Note: Prisma groupBy doesn't support relation filters in some versions,
      // so we use findMany and group manually or just fetch statuses.
      teacher.classrooms.length > 0 
        ? this.prisma.attendance.findMany({
            where: { 
              tenant_uuid: tenantUuid, 
              date: today,
              student: { classroom_id: teacher.classrooms[0].id }
            },
            select: { status: true }
          })
        : Promise.resolve([])
    ]);

    // Process class attendance
    const classAttendanceMap: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    (classAttendance as any[]).forEach((a) => {
      if (a.status) {
        classAttendanceMap[a.status] = (classAttendanceMap[a.status] || 0) + 1;
      }
    });

    return {
      teacher_name: teacher.name,
      homeroom_class: teacher.classrooms[0] || null,
      today_schedules: schedules,
      my_attendance: todayAttendance,
      recent_journals: recentJournals,
      recent_tahfidz: recentTahfidz,
      class_attendance_today: classAttendanceMap
    };
  }
}
