import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { XenditService } from '../tenant/xendit.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private xenditService: XenditService,
  ) {}

  async getStats(tenantUuid: string, startDate?: string, endDate?: string) {
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

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = new Date(`${year}-${month}-${day}`);

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.created_at = {};
      if (startDate) dateFilter.created_at.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) dateFilter.created_at.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const txDateFilter: any = {};
    if (startDate || endDate) {
      txDateFilter.payment_date = {};
      if (startDate) txDateFilter.payment_date.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) txDateFilter.payment_date.lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    
    const disbursementDateFilter: any = {};
    if (startDate || endDate) {
      disbursementDateFilter.disbursement_date = {};
      if (startDate) disbursementDateFilter.disbursement_date.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) disbursementDateFilter.disbursement_date.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

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
      totalDonationIncome,
      totalExpenditure,
      totalPayroll,
      totalDisbursement,
      tenantInfo,
      pendingPermissionsCount,
      tenantWallet,
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
        where: {
          tenant_uuid: tenantUuid,
          student: { deleted_at: null }
        },
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
        where: { 
          tenant_uuid: tenantUuid, 
          status: 'success',
          fee_category: { type: { not: 'donation' } },
          ...txDateFilter
        },
        _sum: { amount_paid: true, net_amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { 
          tenant_uuid: tenantUuid, 
          status: 'success',
          fee_category: { type: 'donation' },
          ...txDateFilter
        },
        _sum: { amount_paid: true, net_amount: true },
      }),
      this.prisma.expenditure.aggregate({
        where: { tenant_uuid: tenantUuid, ...dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.payroll.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'paid', ...dateFilter },
        _sum: { total_amount: true },
      }),
      this.prisma.donationDisbursement.aggregate({
        where: { tenant_uuid: tenantUuid, status: 'success', ...disbursementDateFilter },
        _sum: { amount: true },
      }),
      this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { max_students: true, slug: true, ppdb_is_active: true, name: true, logo: true, description: true, addon_koperasi: true, addon_inventaris: true, storage_limit: true, storage_used: true }
      }),
      this.prisma.studentPermission.count({
        where: { tenant_uuid: tenantUuid, status: 'pending' }
      }),
      this.prisma.tenantWallet.findUnique({
        where: { tenant_uuid: tenantUuid }
      }),
    ]);

    // Koperasi Aggregates
    let koperasiOutletsData: any[] = [];
    let koperasiTotalIncome = 0;

    if (tenantInfo?.addon_koperasi) {
      const outlets = await this.prisma.koperasiOutlet.findMany({
        where: { tenant_uuid: tenantUuid, is_active: true },
        select: { id: true, name: true }
      });

      for (const outlet of outlets) {
        const income = await this.prisma.posOrder.aggregate({
          where: { 
            tenant_uuid: tenantUuid, 
            outlet_id: outlet.id, 
            status: 'completed',
            ...dateFilter
          },
          _sum: { total: true }
        });
        const outletIncome = Number(income._sum.total || 0);
        koperasiOutletsData.push({
          id: outlet.id,
          name: outlet.name,
          income: outletIncome
        });
        koperasiTotalIncome += outletIncome;
      }
    }

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

    const incomeSum = Number(totalIncome._sum.net_amount || totalIncome._sum.amount_paid || 0);
    const donationIncomeSum = Number(totalDonationIncome._sum.net_amount || totalDonationIncome._sum.amount_paid || 0);
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
        total_expense: expenseSum + payrollSum,
        breakdown: {
          expenditure: expenseSum,
          payroll: payrollSum,
        },
      },
      donasi: {
        total_received: donationIncomeSum,
        total_disbursed: disbursementSum,
        balance: donationIncomeSum - disbursementSum,
      },
      koperasi: {
        is_active: tenantInfo?.addon_koperasi || false,
        total_income: koperasiTotalIncome,
        outlets: koperasiOutletsData,
      },
      inventaris: {
        is_active: tenantInfo?.addon_inventaris || false,
      },
      pesantren_slug: tenantInfo?.slug,
      pesantren_name: tenantInfo?.name,
      pesantren_logo: tenantInfo?.logo,
      pesantren_description: tenantInfo?.description,
      ppdb_is_active: tenantInfo?.ppdb_is_active || false,
      tenant_wallet_balance: Number(tenantWallet?.balance || 0),
      storage: {
        limit: tenantInfo?.storage_limit || 5368709120,
        used: tenantInfo?.storage_used || 0,
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
      trialEndingTenants,
      recentUnpaidInvoices,
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
        where: { pesantren: { deleted_at: null } },
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
      this.prisma.pesantren.findMany({
        where: { 
          subscription_status: 'trial', 
          expired_at: { not: null } 
        },
        orderBy: { expired_at: 'asc' },
        take: 5,
        select: { id: true, name: true, expired_at: true }
      }),
      this.prisma.saasInvoice.findMany({
        where: { 
          status: { in: ['unpaid', 'overdue', 'pending'] },
          pesantren: { deleted_at: null }
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { pesantren: { select: { name: true } } }
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
      trial_ending_tenants: trialEndingTenants,
      recent_unpaid_invoices: recentUnpaidInvoices,
    };
  }

  async getSuperAdminFinanceStats() {
    // 1. Get Xendit Balance
    const xenditBalanceData = await this.xenditService.getBalance();
    const xenditBalance = xenditBalanceData?.balance || 0;

    // 2. Aggregate Transactions (Payment Gateway)
    const transactionStats = await this.prisma.transaction.aggregate({
      where: { status: 'success' },
      _sum: {
        amount_paid: true,
        platform_fee: true,
        xendit_fee: true,
      },
    });

    // 3. Aggregate TopupLogs (Payment Gateway)
    const topupStats = await this.prisma.topupLog.aggregate({
      where: { status: 'success' },
      _sum: {
        amount: true,
        platform_fee: true,
        xendit_fee: true,
      },
    });

    // Calculate Gross & Net Income
    const txPlatformFee = Number(transactionStats._sum.platform_fee || 0);
    const txXenditFee = Number(transactionStats._sum.xendit_fee || 0);
    const topupPlatformFee = Number(topupStats._sum.platform_fee || 0);
    const topupXenditFee = Number(topupStats._sum.xendit_fee || 0);

    const grossIncome = txPlatformFee + topupPlatformFee;
    const totalXenditFee = txXenditFee + topupXenditFee;
    const netIncome = grossIncome - totalXenditFee;

    // 4. Get recent transactions related to payment gateway
    const recentTransactions = await this.prisma.transaction.findMany({
      where: { payment_method: 'payment_gateway' },
      orderBy: { payment_date: 'desc' },
      take: 10,
      include: {
        pesantren: { select: { name: true } },
      },
    });

    const recentTopups = await this.prisma.topupLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      include: {
        pesantren: { select: { name: true } },
      },
    });

    return {
      xendit_balance: xenditBalance,
      internal_balance: netIncome, // Net income is effectively the superadmin's internal balance from these fees.
      gross_income: grossIncome,
      net_income: netIncome,
      total_xendit_fee: totalXenditFee,
      breakdown: {
        transactions: {
          platform_fee: txPlatformFee,
          xendit_fee: txXenditFee,
          net: txPlatformFee - txXenditFee,
          total_volume: Number(transactionStats._sum.amount_paid || 0),
        },
        topups: {
          platform_fee: topupPlatformFee,
          xendit_fee: topupXenditFee,
          net: topupPlatformFee - topupXenditFee,
          total_volume: Number(topupStats._sum.amount || 0),
        },
      },
      recent_gateway_transactions: recentTransactions.map(t => ({
        id: t.id,
        type: 'TRANSACTION',
        pesantren_name: t.pesantren?.name,
        amount: Number(t.amount_paid),
        platform_fee: Number(t.platform_fee),
        xendit_fee: Number(t.xendit_fee),
        net: Number(t.platform_fee) - Number(t.xendit_fee),
        date: t.payment_date,
        status: t.status,
      })),
      recent_topups: recentTopups.map(t => ({
        id: t.id,
        type: 'TOPUP',
        pesantren_name: t.pesantren?.name,
        amount: Number(t.amount),
        platform_fee: Number(t.platform_fee),
        xendit_fee: Number(t.xendit_fee),
        net: Number(t.platform_fee) - Number(t.xendit_fee),
        date: t.created_at,
        status: t.status,
      })),
    };
  }

  async getTeacherStats(tenantUuid: string, userId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = new Date(`${year}-${month}-${day}`);

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
      classAttendance,
      totalJournals,
      totalAbsenceGroups
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
      teacher.classrooms.length > 0 
        ? this.prisma.attendance.findMany({
            where: { 
              tenant_uuid: tenantUuid, 
              date: today,
              student: { classroom_id: teacher.classrooms[0].id }
            },
            select: { status: true }
          })
        : Promise.resolve([]),
      // Total journals
      this.prisma.teachingJournal.count({
        where: { tenant_uuid: tenantUuid, teacher_id: teacher.id }
      }),
      // Total attendance sessions filled
      this.prisma.attendance.groupBy({
        by: ['date', 'schedule_id'],
        where: { 
          tenant_uuid: tenantUuid,
          schedule: { teacher_id: teacher.id }
        }
      })
    ]);

    // Process class attendance
    const classAttendanceMap: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    (classAttendance as any[]).forEach((a) => {
      if (a.status) {
        classAttendanceMap[a.status] = (classAttendanceMap[a.status] || 0) + 1;
      }
    });

    const totalAbsences = totalAbsenceGroups.length;
    // Calculate mock performance (can be improved later with real logic)
    const performance = totalAbsences > 0 ? Math.min(100, Math.round((totalJournals / totalAbsences) * 100)) : 100;

    return {
      teacher_name: teacher.name,
      homeroom_class: teacher.classrooms[0] || null,
      today_schedules: schedules,
      my_attendance: todayAttendance,
      recent_journals: recentJournals,
      recent_tahfidz: recentTahfidz,
      class_attendance_today: classAttendanceMap,
      stats: {
        total_journals: totalJournals,
        total_absences: totalAbsences,
        performance: performance > 0 ? performance : 100
      }
    };
  }

  async getTeacherAttendanceToday(tenantUuid: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = new Date(`${year}-${month}-${day}`);

    const attendanceRecords = await this.prisma.teacherAttendance.findMany({
      where: {
        tenant_uuid: tenantUuid,
        date: today
      },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            photo: true
          }
        },
        schedule: {
          select: {
            start_time: true
          }
        }
      }
    });

    return attendanceRecords.map(record => {
      let isLate = false;
      let lateMinutes = 0;

      if (record.check_in && record.schedule?.start_time) {
        // start_time is usually "HH:mm"
        const [startHour, startMinute] = record.schedule.start_time.split(':').map(Number);
        
        const checkInHour = record.check_in.getHours();
        const checkInMinute = record.check_in.getMinutes();

        const scheduleMinutes = startHour * 60 + startMinute;
        const actualMinutes = checkInHour * 60 + checkInMinute;

        if (actualMinutes > scheduleMinutes) {
          isLate = true;
          lateMinutes = actualMinutes - scheduleMinutes;
        }
      }

      return {
        id: record.id,
        teacher_id: record.teacher.id,
        teacher_name: record.teacher.name,
        teacher_photo: record.teacher.photo,
        status: record.status,
        check_in: record.check_in,
        check_out: record.check_out,
        schedule_start: record.schedule?.start_time || null,
        is_late: isLate,
        late_minutes: lateMinutes,
        notes: record.notes
      };
    });
  }

  async getTeacherPunctualityRanking(tenantUuid: string) {
    // Fetch all teacher attendance records that have check_in and a schedule
    const records = await this.prisma.teacherAttendance.findMany({
      where: {
        tenant_uuid: tenantUuid,
        status: 'hadir',
        check_in: { not: null },
        schedule_id: { not: null },
      },
      include: {
        teacher: {
          select: { id: true, name: true, photo: true, nip: true },
        },
        schedule: {
          select: { start_time: true },
        },
      },
    });

    // Aggregate per teacher
    const teacherMap: Record<string, {
      id: string;
      name: string;
      photo: string | null;
      nip: string | null;
      total_hadir: number;
      on_time_count: number;
      late_count: number;
      total_late_minutes: number;
    }> = {};

    for (const record of records) {
      const teacherId = record.teacher.id;
      if (!teacherMap[teacherId]) {
        teacherMap[teacherId] = {
          id: record.teacher.id,
          name: record.teacher.name,
          photo: (record.teacher as any).photo || null,
          nip: (record.teacher as any).nip || null,
          total_hadir: 0,
          on_time_count: 0,
          late_count: 0,
          total_late_minutes: 0,
        };
      }

      const entry = teacherMap[teacherId];
      entry.total_hadir++;

      if (record.check_in && record.schedule?.start_time) {
        const [startHour, startMinute] = record.schedule.start_time.split(':').map(Number);
        const checkIn = new Date(record.check_in);
        const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
        const scheduleMinutes = startHour * 60 + startMinute;

        if (checkInMinutes > scheduleMinutes) {
          entry.late_count++;
          entry.total_late_minutes += (checkInMinutes - scheduleMinutes);
        } else {
          entry.on_time_count++;
        }
      }
    }

    const teachers = Object.values(teacherMap).map(t => ({
      ...t,
      on_time_percentage: t.total_hadir > 0 ? Math.round((t.on_time_count / t.total_hadir) * 100) : 0,
      avg_late_minutes: t.late_count > 0 ? Math.round(t.total_late_minutes / t.late_count) : 0,
    }));

    // Sort: most punctual first (highest on_time_percentage, then most total_hadir)
    const mostPunctual = [...teachers]
      .sort((a, b) => b.on_time_percentage - a.on_time_percentage || b.total_hadir - a.total_hadir)
      .slice(0, 20);

    // Sort: most frequently late first (highest late_count, then highest avg late)
    const mostLate = [...teachers]
      .filter(t => t.late_count > 0)
      .sort((a, b) => b.late_count - a.late_count || b.avg_late_minutes - a.avg_late_minutes)
      .slice(0, 20);

    return {
      most_punctual: mostPunctual,
      most_late: mostLate,
      total_teachers_tracked: teachers.length,
    };
  }

  async getEmployeePerformance(tenantUuid: string) {
    // Karyawan = users with roles STAFF_PESANTREN, FINANCE_PESANTREN, KEPALA_KOPERASI, STAF_KOPERASI
    const employees = await this.prisma.user.findMany({
      where: {
        tenant_uuid: tenantUuid,
        role: {
          in: ['STAFF_PESANTREN', 'FINANCE_PESANTREN', 'KEPALA_KOPERASI', 'STAF_KOPERASI']
        },
        deleted_at: null
      },
      select: {
        id: true,
        name: true,
        role: true,
        last_login_at: true,
        phone: true,
        _count: {
          select: {
            activities: {
              where: {
                created_at: {
                  gte: new Date(new Date().setHours(0, 0, 0, 0)) // Today's activities
                }
              }
            }
          }
        }
      }
    });

    return employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      phone: emp.phone,
      last_login_at: emp.last_login_at,
      today_activities_count: emp._count.activities,
      // Status could be derived from today's activities or last login
      status: emp._count.activities > 0 ? 'active_today' : (emp.last_login_at ? 'inactive_today' : 'never_logged_in')
    }));
  }
}
