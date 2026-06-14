import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const normalizedPhone = normalizePhone(cleanPhone);
    const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;
    const phoneVariants = [normalizedPhone, legacyPhone, cleanPhone, phone].filter(v => v && v.length >= 5);

    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        parent_phone: { in: phoneVariants },
        status: { in: ['AKTIF', 'active'] },
        deleted_at: null,
      },
    });
    if (!student) throw new ForbiddenException('Santri tidak ditemukan atau bukan anak Anda');
    return student;
  }

  // Helper: get all linked student IDs for virtual grouping
  private async getLinkedStudentIds(student: any) {
    let whereClause: any = {
      tenant_uuid: student.tenant_uuid,
      parent_phone: student.parent_phone,
      status: { in: ['AKTIF', 'active'] },
      deleted_at: null
    };

    if (student.nik && student.nik.trim() !== '') {
      whereClause.nik = student.nik;
    } else {
      whereClause.name = student.name;
      if (student.birth_date) {
        whereClause.birth_date = student.birth_date;
      }
    }

    const linkedStudents = await this.prisma.student.findMany({
      where: whereClause,
      select: { id: true, wallet: true }
    });

    return linkedStudents.map(s => s.id);
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

    // Grouping by NIK or Name+BirthDate
    const grouped = new Map<string, any>();
    for (const s of students) {
      const key = (s.nik && s.nik.trim() !== '') 
        ? s.nik 
        : `${s.name.toLowerCase()}_${s.birth_date ? new Date(s.birth_date).getTime() : ''}`;

      if (!grouped.has(key)) {
        grouped.set(key, { ...s, linked_ids: [s.id] });
      } else {
        const existing = grouped.get(key);
        existing.linked_ids.push(s.id);
        // Prioritize a student with a wallet over one without
        if (!existing.wallet && s.wallet) {
          existing.wallet = s.wallet;
        }
      }
    }

    const groupedStudents = Array.from(grouped.values());

    return Promise.all(
      groupedStudents.map(async (s) => {
        const totalBills = await this.prisma.bill.aggregate({
          where: { student_id: { in: s.linked_ids }, status: { not: 'paid' } },
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
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user) {
        if (user.tenant_uuid && user.tenant_uuid !== student.tenant_uuid) {
          throw new ConflictException('Anda tidak dapat menghubungkan santri dari pesantren lain.');
        }
        if (!user.tenant_uuid) {
          await tx.user.update({
            where: { id: userId },
            data: { tenant_uuid: student.tenant_uuid },
          });
        }
      }

      // Update student's parent_phone to match this user
      await tx.student.update({
        where: { id: student.id },
        data: { parent_phone: normalizedPhone },
      });
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
            phone: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');

    let summary = {
      active_children: 0,
      highest_achievement: 'Belum ada',
      bill_status: 'Lunas'
    };

    let settings = {
      admin_wa: user.pesantren?.phone || '',
      facebook_url: '',
      instagram_url: '',
      twitter_url: ''
    };

    if (user.tenant_uuid) {
      // 1. Get settings
      const tenantSettings = await this.prisma.setting.findMany({
        where: { tenant_uuid: user.tenant_uuid }
      });
      for (const s of tenantSettings) {
        if (s.key === 'admin_wa' && s.value) settings.admin_wa = s.value;
        if (s.key === 'facebook_url' && s.value) settings.facebook_url = s.value;
        if (s.key === 'instagram_url' && s.value) settings.instagram_url = s.value;
        if (s.key === 'twitter_url' && s.value) settings.twitter_url = s.value;
      }

      // 2. Get students summary
      if (user.phone) {
        const cleanPhone = user.phone.replace(/[^0-9]/g, '');
        const normalizedPhone = normalizePhone(cleanPhone);
        const legacyPhone = normalizedPhone.startsWith('628') ? '0' + normalizedPhone.slice(2) : cleanPhone;
        const phoneVariants = [normalizedPhone, legacyPhone, cleanPhone, user.phone].filter(v => v && v.length >= 5);

        const activeStudents = await this.prisma.student.findMany({
          where: {
            tenant_uuid: user.tenant_uuid,
            parent_phone: { in: phoneVariants },
            status: { in: ['AKTIF', 'active'] },
            deleted_at: null
          },
          select: { id: true }
        });

        summary.active_children = activeStudents.length;

        if (activeStudents.length > 0) {
          const studentIds = activeStudents.map(s => s.id);

          // Get highest juz or latest title
          const tahfidz = await this.prisma.tahfidzRecord.findFirst({
            where: { student_id: { in: studentIds } },
            orderBy: [
              { juz: 'desc' },
              { date: 'desc' }
            ]
          });
          
          if (tahfidz) {
            if (tahfidz.juz) summary.highest_achievement = `Juz ${tahfidz.juz}`;
            else summary.highest_achievement = tahfidz.title;
          }

          // Check any unpaid bills for current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          
          const unpaidBill = await this.prisma.bill.findFirst({
            where: {
              student_id: { in: studentIds },
              status: { not: 'paid' },
              due_date: {
                gte: startOfMonth,
                lte: endOfMonth
              }
            }
          });

          if (unpaidBill) {
            summary.bill_status = 'Belum Lunas';
          }
        }
      }
    }

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
      summary,
      settings
    };
  }

  // ── Student Detail ──
  async getStudentDetail(tenantUuid: string, phone: string, studentId: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const studentDetail = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_uuid: student.tenant_uuid },
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
  async getAttendance(tenantUuid: string, phone: string, studentId: string, month?: string, exactDate?: string, sort: 'asc' | 'desc' = 'desc') {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    
    const where: any = { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } };
    if (exactDate) {
      const start = new Date(`${exactDate}T00:00:00.000Z`);
      const end = new Date(`${exactDate}T23:59:59.999Z`);
      where.date = { gte: start, lte: end };
    } else if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }

    // Build summary using groupBy
    const summaryGroups = await this.prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const summary = { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0 };
    summaryGroups.forEach((g) => {
      if (g.status === 'hadir') summary.hadir = g._count.status;
      else if (g.status === 'izin') summary.izin = g._count.status;
      else if (g.status === 'sakit') summary.sakit = g._count.status;
      else summary.alpha += g._count.status;
      summary.total += g._count.status;
    });

    const records = await this.prisma.attendance.findMany({
      where,
      include: {
        schedule: {
          include: { classroom: { include: { unit: { select: { name: true } } } } }
        }
      },
      orderBy: { date: sort },
      take: 20,
    });

    return { records, summary };
  }

  // ── Shalat Attendance ──
  async getShalatAttendance(tenantUuid: string, phone: string, studentId: string, month?: string, exactDate?: string, sort: 'asc' | 'desc' = 'desc') {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);

    const where: any = { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } };
    if (exactDate) {
      const start = new Date(`${exactDate}T00:00:00.000Z`);
      const end = new Date(`${exactDate}T23:59:59.999Z`);
      where.date = { gte: start, lte: end };
    } else if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }

    // Build summary using groupBy
    const summaryGroups = await this.prisma.shalatAttendance.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const summary: Record<string, number> = { jamaah: 0, munfarid: 0, izin: 0, sakit: 0, alpha: 0, haid: 0, total: 0 };
    summaryGroups.forEach((g) => {
      if (summary[g.status] !== undefined) {
        summary[g.status] = g._count.status;
      }
      summary.total += g._count.status;
    });

    const records = await this.prisma.shalatAttendance.findMany({
      where,
      orderBy: { date: sort },
      take: 20,
    });

    return { records, summary };
  }

  // ── Tahfidz ──
  async getTahfidz(tenantUuid: string, phone: string, studentId: string, category?: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    
    const where: any = { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } };
    if (category) where.category = category.toUpperCase();

    const records = await this.prisma.tahfidzRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 20,
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
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    return this.prisma.healthRecord.findMany({
      where: { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } },
      orderBy: { date: 'desc' },
      take: 20,
    });
  }

  // ── Violations ──
  async getViolations(tenantUuid: string, phone: string, studentId: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    const records = await this.prisma.violation.findMany({
      where: { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } },
      orderBy: { date: 'desc' },
      take: 20,
    });
    const totalPoints = records.reduce((sum, v) => sum + v.points, 0);
    return { records, totalPoints, maxPoints: 100 };
  }

  // ── Permissions / Leave ──
  async getPermissions(tenantUuid: string, phone: string, studentId: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    return this.prisma.studentPermission.findMany({
      where: { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } },
      orderBy: { created_at: 'desc' },
      take: 20,
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
        tenant_uuid: student.tenant_uuid,
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
          tenant_uuid: student.tenant_uuid,
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
          await this.whatsappService.sendMessage(admin.phone, message, student.tenant_uuid);
        }
      }
    } catch (err) {
      console.error('Failed to send permission notification:', err);
    }

    return permission;
  }

  // ── Bills ──
  async getBills(tenantUuid: string, phone: string, studentId: string, status?: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    const where: any = { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds } };
    if (status) where.status = status;
    return this.prisma.bill.findMany({
      where,
      include: { fee_category: { select: { name: true, type: true } }, unit: { select: { name: true } } },
      orderBy: { due_date: 'desc' },
    });
  }

  // ── Transactions ──
  async getTransactions(tenantUuid: string, phone: string, studentId: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    return this.prisma.transaction.findMany({
      where: { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds }, status: 'success' },
      include: {
        fee_category: { select: { name: true } },
        bill: { select: { period: true } },
        unit: { select: { name: true } },
      },
      orderBy: { payment_date: 'desc' },
      take: 20,
    });
  }

  async getTransactionReceiptHtml(tenantUuid: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        pesantren: true,
        student: { include: { classroom: true } },
        fee_category: true,
        bill: true,
      },
    });

    if (!transaction) throw new NotFoundException('Transaksi tidak ditemukan');

    const amount = Number(transaction.amount_paid).toLocaleString('id-ID');
    const date = new Date(transaction.payment_date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    
    const time = new Date(transaction.payment_date).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const paymentMethodLabel = 
      transaction.payment_method === 'saldo_santri' ? 'Saldo Santri' :
      transaction.payment_method === 'payment_gateway' ? `Payment Gateway (${transaction.payment_channel || 'Auto'})` :
      transaction.payment_method === 'cash' ? 'Tunai' :
      transaction.payment_method === 'transfer' ? 'Transfer Bank' : transaction.payment_method;

    return `
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <title>Kwitansi Pembayaran - ${transaction.reference_no}</title>
          <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; padding: 20px; background: #f9f9f9; }
              .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; background: #fff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); border-radius: 8px; }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 20px; }
              .logo-container { display: flex; align-items: center; gap: 15px; }
              .logo { width: 60px; height: 60px; object-fit: contain; }
              .pesantren-info h2 { margin: 0; color: #064e3b; font-size: 20px; }
              .pesantren-info p { margin: 2px 0; font-size: 13px; color: #666; }
              .invoice-info { text-align: right; }
              .invoice-info h1 { margin: 0; font-size: 24px; color: #10b981; text-transform: uppercase; letter-spacing: 2px; }
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
              .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 13px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
              @media print {
                  body { background: none; padding: 0; }
                  .invoice-box { box-shadow: none; border: none; padding: 10px; }
                  .no-print { display: none; }
              }
          </style>
      </head>
      <body>
          <div class="no-print" style="text-align: center; margin-bottom: 20px;">
              <button onclick="window.print()" style="padding: 10px 20px; background: #10b981; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Cetak Kwitansi / Simpan PDF</button>
          </div>
          <div class="invoice-box">
              <div class="header">
                  <div class="logo-container">
                      ${transaction.pesantren.logo ? `<img src="${transaction.pesantren.logo}" class="logo" alt="Logo" />` : ''}
                      <div class="pesantren-info">
                          <h2>${transaction.pesantren.name}</h2>
                          <p>${transaction.pesantren.address || ''}</p>
                          <p>${transaction.pesantren.phone ? 'Telp: ' + transaction.pesantren.phone : ''}</p>
                      </div>
                  </div>
                  <div class="invoice-info">
                      <h1>Kwitansi</h1>
                      <div style="font-weight: 600; margin-top: 5px;">No: ${transaction.reference_no}</div>
                      <div class="status-badge" style="margin-top: 8px;">${transaction.status === 'success' ? 'BERHASIL' : transaction.status.toUpperCase()}</div>
                  </div>
              </div>

              <div class="details-grid">
                  <div class="detail-item">
                      <span class="detail-label">Tanggal Pembayaran</span>
                      <span class="detail-value">${date} ${time}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Metode Pembayaran</span>
                      <span class="detail-value">${paymentMethodLabel}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">Nama Santri</span>
                      <span class="detail-value">${transaction.student.name}</span>
                  </div>
                  <div class="detail-item">
                      <span class="detail-label">NIS / Kelas</span>
                      <span class="detail-value">${transaction.student.nis || '-'} / ${transaction.student.classroom?.name || '-'}</span>
                  </div>
              </div>

              <table>
                  <thead>
                      <tr>
                          <th>Deskripsi Pembayaran</th>
                          <th style="text-align: right;">Jumlah</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td>
                              <div style="font-weight: 600; color: #1e293b;">${transaction.fee_category?.name || 'Pembayaran Tagihan'}</div>
                              ${transaction.bill?.period ? `<div style="font-size: 13px; color: #64748b; margin-top: 4px;">Periode: ${transaction.bill.period}</div>` : ''}
                          </td>
                          <td style="text-align: right; vertical-align: top; font-weight: 500;">Rp ${amount}</td>
                      </tr>
                      ${Number(transaction.surcharge_fee) > 0 ? `
                      <tr>
                          <td style="font-size: 13px; color: #64748b;">Biaya Layanan / Admin</td>
                          <td style="text-align: right; font-size: 13px; color: #64748b;">Rp ${Number(transaction.surcharge_fee).toLocaleString('id-ID')}</td>
                      </tr>
                      ` : ''}
                      <tr class="total-row">
                          <td style="text-align: right;">Total Bayar</td>
                          <td style="text-align: right; color: #10b981;">Rp ${(Number(transaction.amount_paid) + Number(transaction.surcharge_fee)).toLocaleString('id-ID')}</td>
                      </tr>
                  </tbody>
              </table>

              <div class="footer">
                  Kwitansi ini adalah bukti pembayaran yang sah.<br>
                  Terima kasih atas pembayaran yang telah dilakukan.<br>
                  <em>Dicetak secara otomatis oleh sistem pada ${new Date().toLocaleString('id-ID')}</em>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  // ── Report Cards ──
  async getReportCards(tenantUuid: string, phone: string, studentId: string) {
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);
    return this.prisma.reportCard.findMany({
      where: { tenant_uuid: student.tenant_uuid, student_id: { in: linkedIds }, status: 'published' },
      include: {
        academic_year: { select: { name: true } },
        period: { select: { name: true } },
        classroom: { select: { name: true, unit: { select: { name: true } } } },
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
  async getAnnouncements(tenantUuid: string, phone: string, studentId?: string) {
    let targetTenant = tenantUuid;
    if (studentId && studentId !== 'undefined' && studentId !== 'null' && studentId.trim() !== '') {
      const student = await this.verifyOwnership(tenantUuid, phone, studentId);
      targetTenant = student.tenant_uuid;
    }
    return this.prisma.post.findMany({
      where: { tenant_uuid: targetTenant, is_published: true },
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
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);

    const wallet = await this.prisma.wallet.findFirst({
      where: { student_id: { in: linkedIds }, tenant_uuid: student.tenant_uuid },
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
    const student = await this.verifyOwnership(tenantUuid, phone, studentId);
    const linkedIds = await this.getLinkedStudentIds(student);

    const wallet = await this.prisma.wallet.findFirst({
      where: { student_id: { in: linkedIds }, tenant_uuid: student.tenant_uuid },
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
