import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../../common/utils/phone.util';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { KoperasiService } from '../koperasi/koperasi.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WalisantriService {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    private koperasiSvc: KoperasiService,
  ) {}

  // Helper: verify student belongs to this wali
  private async verifyOwnership(tenantUuid: string, phone: string, studentId: string) {
    if (!phone || phone.length < 5) {
      throw new ForbiddenException('Akses ditolak: Nomor telepon tidak valid');
    }
    const normalizedPhone = normalizePhone(phone);
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        tenant_uuid: tenantUuid,
        parent_phone: normalizedPhone,
        status: { in: ['AKTIF', 'active'] },
        deleted_at: null,
      },
    });
    if (!student) throw new ForbiddenException('Santri tidak ditemukan atau bukan anak Anda');
    return student;
  }

  // ── My Students ──
  async getMyStudents(tenantUuid: string, phone: string) {
    if (!phone || phone.trim() === '') return [];
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 5) return []; // Minimum phone length to avoid broad matches

    const normalizedPhone = normalizePhone(cleanPhone);
    const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;

    // Filter variants to ensure we only search for valid, non-empty strings
    const phoneVariants = [normalizedPhone, legacyPhone, cleanPhone, phone].filter(v => v && v.length >= 5);

    const students = await this.prisma.student.findMany({
      where: { 
        tenant_uuid: tenantUuid, 
        parent_phone: { in: phoneVariants },
        status: { in: ['AKTIF', 'active'] },
        deleted_at: null 
      },
      include: {
        classroom: { select: { id: true, name: true } },
        dormitory: { select: { id: true, name: true } },
        dormitory_room: { select: { id: true, name: true } },
        wallet: { select: { id: true, balance: true, pin: true, daily_spending_limit: true, weekly_spending_limit: true } },
      },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      students.map(async (s) => {
        const totalBills = await this.prisma.bill.aggregate({
          where: { student_id: s.id, status: { not: 'paid' } },
          _sum: { amount: true, amount_paid: true },
        });
        const unpaidAmount =
          Number(totalBills?._sum?.amount || 0) -
          Number(totalBills?._sum?.amount_paid || 0);
        return { 
          ...s, 
          total_unpaid_bills: unpaidAmount,
          wallet: s.wallet ? {
            ...s.wallet,
            has_pin: !!s.wallet.pin,
            pin: undefined,
            daily_spending_limit: s.wallet.daily_spending_limit ? Number(s.wallet.daily_spending_limit) : null,
            weekly_spending_limit: s.wallet.weekly_spending_limit ? Number(s.wallet.weekly_spending_limit) : null,
          } : null
        };
      }),
    );
  }

  // ── Claim Student (Link Account) ──
  async claimStudent(userId: string, phone: string, dto: { nik: string; birth_date: string; mother_name: string }) {
    const normalizedPhone = normalizePhone(phone);
    
    if (!dto.nik || !dto.birth_date || !dto.mother_name) {
      throw new BadRequestException('NIK, Tanggal Lahir, dan Nama Ibu harus diisi');
    }
    
    const student = await this.prisma.student.findFirst({
      where: {
        nik: dto.nik,
        status: { in: ['AKTIF', 'active'] },
        deleted_at: null,
      },
    });
    
    if (!student) {
      throw new NotFoundException('Santri dengan NIK tersebut tidak ditemukan');
    }
    
    // Verify birth date if provided in student record
    if (student.birth_date) {
      const inputDate = new Date(dto.birth_date).toDateString();
      const studentDate = new Date(student.birth_date).toDateString();
      if (inputDate !== studentDate) {
        throw new ForbiddenException('Tanggal lahir tidak cocok');
      }
    }
    
    // Verify mother name if provided in student record
    if (student.mother_name) {
      if (student.mother_name.toLowerCase().trim() !== dto.mother_name.toLowerCase().trim()) {
        throw new ForbiddenException('Nama Ibu Kandung tidak cocok');
      }
    }
    
    // Link the student
    await this.prisma.$transaction(async (tx) => {
      // Update student's parent_phone to match this user
      await tx.student.update({
        where: { id: student.id },
        data: { parent_phone: normalizedPhone },
      });
      
      // Also update user's tenant_uuid if it's null
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user && !user.tenant_uuid) {
        await tx.user.update({
          where: { id: userId },
          data: { tenant_uuid: student.tenant_uuid },
        });
      }
    });
    
    return { message: 'Santri berhasil dihubungkan', student_id: student.id };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        pesantren: {
          select: {
            name: true,
            slug: true,
            logo: true,
            calendar_type: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      tenant_uuid: user.tenant_uuid,
      pesantren_name: user.pesantren?.name,
      pesantren_slug: user.pesantren?.slug,
      pesantren_logo: user.pesantren?.logo,
      calendar_type: user.pesantren?.calendar_type || 'gregorian',
    };
  }

  // ── Student Detail ──
  async getStudentDetail(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    const studentDetail = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_uuid: tenantUuid },
      include: {
        classroom: true,
        dormitory: true,
        dormitory_room: true,
        wallet: true,
        tahfidz_records: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        health_records: {
          orderBy: { date: 'desc' },
          take: 5,
        },
        violations: {
          orderBy: { date: 'desc' },
          take: 5,
        },
      },
    });

    if (studentDetail) {
      if (studentDetail.wallet) {
        (studentDetail as any).wallet.has_pin = !!studentDetail.wallet.pin;
        (studentDetail as any).wallet.pin = undefined;
      }
      // Alias violations to violation_records for frontend consistency
      (studentDetail as any).violation_records = (studentDetail as any).violations;
    }

    return studentDetail;
  }

  // ── Attendance ──
  async getAttendance(tenantUuid: string, phone: string, studentId: string, month?: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    const where: any = { tenant_uuid: tenantUuid, student_id: studentId };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }
    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100,
    });

    // Build summary
    const summary = { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: records.length };
    records.forEach((r) => {
      if (r.status === 'hadir') summary.hadir++;
      else if (r.status === 'izin') summary.izin++;
      else if (r.status === 'sakit') summary.sakit++;
      else summary.alpha++;
    });

    return { records, summary };
  }

  // ── Tahfidz ──
  async getTahfidz(tenantUuid: string, phone: string, studentId: string, category?: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    
    const where: any = { tenant_uuid: tenantUuid, student_id: studentId };
    if (category) where.category = category.toUpperCase();

    const records = await this.prisma.tahfidzRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100,
    });

    // Stats
    const uniqueJuz = new Set(records.filter(r => r.juz).map(r => r.juz)).size;
    const uniqueTitle = new Set(records.map(r => r.title)).size;
    const thisMonth = records.filter(r => {
      const d = new Date(r.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    return { 
      records, 
      stats: { 
        totalJuz: uniqueJuz, 
        totalTitle: uniqueTitle, // Used as Surah for Quran or Kitab for Nadhom
        thisMonth 
      } 
    };
  }

  // ── Health ──
  async getHealth(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    return this.prisma.healthRecord.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { date: 'desc' },
      take: 50,
    });
  }

  // ── Violations ──
  async getViolations(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    const records = await this.prisma.violation.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { date: 'desc' },
    });
    const totalPoints = records.reduce((sum, v) => sum + v.points, 0);
    return { records, totalPoints, maxPoints: 100 };
  }

  // ── Permissions / Leave ──
  async getPermissions(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    return this.prisma.studentPermission.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createPermission(
    tenantUuid: string,
    phone: string,
    studentId: string,
    body: { type: string; reason: string; start_date: string; end_date?: string },
  ) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const permission = await this.prisma.studentPermission.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        type: body.type || 'keperluan',
        reason: body.reason,
        start_date: new Date(body.start_date),
        end_date: body.end_date ? new Date(body.end_date) : null,
        status: 'pending',
      },
    });

    // ── Notify Admins Real-time ──
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          tenant_uuid: tenantUuid,
          role: { in: ['ADMIN_PESANTREN', 'STAFF_PESANTREN'] },
          deleted_at: null,
          is_active: true,
        },
      });

      const message = `*NOTIFIKASI PERIZINAN BARU*
      
Santri: *${student.name}*
Tipe: ${permission.type.toUpperCase()}
Alasan: ${permission.reason}
Tanggal Mulai: ${new Date(permission.start_date).toLocaleDateString('id-ID')}

Mohon segera periksa dashboard untuk memberikan persetujuan.`;

      for (const admin of admins) {
        // In-app notification record
        await this.prisma.userNotification.create({
          data: {
            user_id: admin.id,
            title: 'Perizinan Baru',
            message: `Walisantri ${student.name} mengajukan izin: ${permission.reason}`,
            type: 'PERMISSION',
            action_data: { permission_id: permission.id }
          },
        });

        // WhatsApp alert
        if (admin.phone) {
          await this.whatsappService.sendMessage(admin.phone, message, tenantUuid);
        }
      }
    } catch (err) {
      console.error('Failed to send permission notification:', err);
    }

    return permission;
  }

  // ── Bills ──
  async getBills(tenantUuid: string, phone: string, studentId: string, status?: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    const where: any = { tenant_uuid: tenantUuid, student_id: studentId };
    if (status) where.status = status;
    return this.prisma.bill.findMany({
      where,
      include: { fee_category: { select: { name: true, type: true } } },
      orderBy: { due_date: 'desc' },
    });
  }

  // ── Report Cards ──
  async getReportCards(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    return this.prisma.reportCard.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId, status: 'published' },
      include: {
        academic_year: { select: { name: true } },
        period: { select: { name: true } },
        classroom: { select: { name: true } },
        details: {
          include: { subject: { select: { name: true, kkm: true } } },
          orderBy: { subject: { name: 'asc' } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ── Notifications ──
  async getNotifications(userId: string) {
    return this.prisma.userNotification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(userId: string, notifId: string) {
    return this.prisma.userNotification.updateMany({
      where: { id: notifId, user_id: userId },
      data: { is_read: true },
    });
  }

  async markAllNotificationsRead(userId: string) {
    return this.prisma.userNotification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }

  // ── Announcements ──
  async getAnnouncements(tenantUuid: string) {
    return this.prisma.post.findMany({
      where: { tenant_uuid: tenantUuid, is_published: true },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
  }

  // ── Admin: Leave Request Management ──
  async getPendingPermissions(tenantUuid: string) {
    return this.prisma.studentPermission.findMany({
      where: { tenant_uuid: tenantUuid, status: 'pending' },
      include: { student: { select: { name: true, nis: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async updatePermissionStatus(tenantUuid: string, id: string, status: string) {
    return this.prisma.studentPermission.update({
      where: { id, tenant_uuid: tenantUuid },
      data: { status },
    });
  }

  // ── Spending Limit Management ──
  async setSpendingLimit(
    tenantUuid: string,
    phone: string,
    studentId: string,
    body: { daily_limit?: number | null; weekly_limit?: number | null },
  ) {
    await this.verifyOwnership(tenantUuid, phone, studentId);

    const wallet = await this.prisma.wallet.findFirst({
      where: { student_id: studentId, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Wallet santri tidak ditemukan');

    const data: any = {};
    if (body.daily_limit !== undefined) {
      data.daily_spending_limit = body.daily_limit !== null
        ? new Prisma.Decimal(body.daily_limit)
        : null;
    }
    if (body.weekly_limit !== undefined) {
      data.weekly_spending_limit = body.weekly_limit !== null
        ? new Prisma.Decimal(body.weekly_limit)
        : null;
    }

    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data,
    });

    const parts: string[] = [];
    if (body.daily_limit !== undefined) {
      parts.push(body.daily_limit !== null
        ? `Harian: Rp ${body.daily_limit.toLocaleString('id-ID')}`
        : 'Limit harian dihapus');
    }
    if (body.weekly_limit !== undefined) {
      parts.push(body.weekly_limit !== null
        ? `Mingguan: Rp ${body.weekly_limit.toLocaleString('id-ID')}`
        : 'Limit mingguan dihapus');
    }

    return {
      message: `Batas jajan berhasil diperbarui. ${parts.join(', ')}`,
      daily_spending_limit: body.daily_limit !== undefined ? body.daily_limit : Number(wallet.daily_spending_limit) || null,
      weekly_spending_limit: body.weekly_limit !== undefined ? body.weekly_limit : Number(wallet.weekly_spending_limit) || null,
    };
  }

  async getSpendingSummary(
    tenantUuid: string,
    phone: string,
    studentId: string,
  ) {
    await this.verifyOwnership(tenantUuid, phone, studentId);

    const wallet = await this.prisma.wallet.findFirst({
      where: { student_id: studentId, tenant_uuid: tenantUuid },
    });
    if (!wallet) throw new NotFoundException('Wallet santri tidak ditemukan');

    const todaySpent = await this.koperasiSvc.getTodaySpending(wallet.id);
    const weekSpent = await this.koperasiSvc.getWeekSpending(wallet.id);
    const dailyLimit = wallet.daily_spending_limit ? Number(wallet.daily_spending_limit) : null;
    const weeklyLimit = wallet.weekly_spending_limit ? Number(wallet.weekly_spending_limit) : null;

    // Get recent transactions (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentTx = await this.prisma.walletTransaction.findMany({
      where: {
        wallet_id: wallet.id,
        type: 'payment',
        created_at: { gte: weekAgo },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    return {
      balance: Number(wallet.balance),
      daily_spending_limit: dailyLimit,
      weekly_spending_limit: weeklyLimit,
      today_spent: todaySpent,
      week_spent: weekSpent,
      remaining_daily: dailyLimit !== null ? Math.max(0, dailyLimit - todaySpent) : null,
      remaining_weekly: weeklyLimit !== null ? Math.max(0, weeklyLimit - weekSpent) : null,
      recent_spending: recentTx,
    };
  }
}
