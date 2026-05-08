import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../../common/utils/phone.util';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class WalisantriService {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
  ) {}

  // Helper: verify student belongs to this wali
  private async verifyOwnership(tenantUuid: string, phone: string, studentId: string) {
    const normalizedPhone = normalizePhone(phone);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_uuid: tenantUuid, parent_phone: normalizedPhone, deleted_at: null },
    });
    if (!student) throw new ForbiddenException('Santri tidak ditemukan atau bukan anak Anda');
    return student;
  }

  // ── My Students ──
  async getMyStudents(tenantUuid: string, phone: string) {
    const normalizedPhone = normalizePhone(phone);
    return this.prisma.student.findMany({
      where: { tenant_uuid: tenantUuid, parent_phone: normalizedPhone, deleted_at: null },
      include: {
        classroom: { select: { id: true, name: true } },
        dormitory: { select: { id: true, name: true } },
        dormitory_room: { select: { id: true, name: true } },
        wallet: { select: { id: true, balance: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Student Detail ──
  async getStudentDetail(tenantUuid: string, phone: string, studentId: string) {
    await this.verifyOwnership(tenantUuid, phone, studentId);
    return this.prisma.student.findFirst({
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
      },
    });
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
}
