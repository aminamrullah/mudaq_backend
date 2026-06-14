import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherAttendanceDto, BulkTeacherAttendanceDto, TeacherLeaveDto } from './dto/teacher-attendance.dto';
import { FaceRecognitionService } from './face-recognition.service';

@Injectable()
export class TeacherAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceRecognitionService: FaceRecognitionService
  ) {}

  async registerFace(user_id: string, image_base64: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { user_id } });
    if (!teacher) throw new BadRequestException('Akun guru tidak ditemukan');
    
    // Extract face descriptor
    const descriptor = await this.faceRecognitionService.getDescriptorFromBase64(image_base64);
    
    // Save to database
    await this.prisma.teacher.update({
      where: { id: teacher.id },
      data: { face_descriptor: Array.from(descriptor) as any },
    });
    
    return { message: 'Wajah berhasil didaftarkan!' };
  }

  async create(tenant_uuid: string, dto: CreateTeacherAttendanceDto) {
    // Check for existing attendance on the same date/schedule
    const existing = await this.prisma.teacherAttendance.findFirst({
      where: {
        tenant_uuid,
        teacher_id: dto.teacher_id,
        date: new Date(dto.date),
        schedule_id: dto.schedule_id || null,
      },
    });

    if (existing) {
      return this.prisma.teacherAttendance.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          check_in: dto.check_in ? new Date(dto.check_in) : existing.check_in,
          check_out: dto.check_out ? new Date(dto.check_out) : existing.check_out,
          notes: dto.notes ?? existing.notes,
        },
      });
    }

    return this.prisma.teacherAttendance.create({
      data: {
        tenant_uuid,
        teacher_id: dto.teacher_id,
        schedule_id: dto.schedule_id || null,
        date: new Date(dto.date),
        status: dto.status,
        check_in: dto.check_in ? new Date(dto.check_in) : null,
        check_out: dto.check_out ? new Date(dto.check_out) : null,
        notes: dto.notes,
      },
    });
  }

  async bulkCreate(tenant_uuid: string, dto: BulkTeacherAttendanceDto) {
    const results = [];
    for (const data of dto.data) {
      try {
        const res = await this.create(tenant_uuid, data);
        results.push({ status: 'success', data: res });
      } catch (err: any) {
        results.push({ status: 'error', error: err.message, payload: data });
      }
    }
    return results;
  }

  async requestLeave(tenant_uuid: string, user_id: string, dto: TeacherLeaveDto) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id, tenant_uuid }
    });
    if (!teacher) throw new BadRequestException('Akun guru tidak ditemukan');

    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.schedule_id, tenant_uuid }
    });
    if (!schedule) throw new BadRequestException('Jadwal tidak ditemukan');

    // Create or update attendance to izin
    const existing = await this.prisma.teacherAttendance.findFirst({
      where: {
        tenant_uuid,
        teacher_id: teacher.id,
        date: new Date(dto.date),
        schedule_id: dto.schedule_id,
      },
    });

    if (existing) {
      await this.prisma.teacherAttendance.update({
        where: { id: existing.id },
        data: {
          status: 'izin',
          notes: dto.notes ?? existing.notes,
        },
      });
    } else {
      await this.prisma.teacherAttendance.create({
        data: {
          tenant_uuid,
          teacher_id: teacher.id,
          schedule_id: dto.schedule_id,
          date: new Date(dto.date),
          status: 'izin',
          notes: dto.notes,
        },
      });
    }

    const adminUser = await this.prisma.user.findFirst({
      where: { tenant_uuid, role: 'ADMIN_PESANTREN' },
      select: { phone: true }
    });

    const tenant = await this.prisma.pesantren.findFirst({
      where: { id: tenant_uuid },
      select: { name: true }
    });

    return {
      message: 'Izin berhasil diajukan',
      admin_phone: adminUser?.phone || '',
      tenant_name: tenant?.name || ''
    };
  }

  async findByDate(tenant_uuid: string, date: string) {
    return this.prisma.teacherAttendance.findMany({
      where: {
        tenant_uuid,
        date: new Date(date),
      },
      include: {
        teacher: true,
        schedule: {
          include: {
            subject: true,
            classroom: true
          }
        }
      },
    });
  }

  async getTeacherAttendance(tenant_uuid: string, teacher_id: string, month?: string) {
    const where: any = { tenant_uuid, teacher_id };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      where.date = { gte: start, lte: end };
    }

    return this.prisma.teacherAttendance.findMany({
      where,
      include: {
        schedule: {
          include: {
            subject: true,
            classroom: true
          }
        }
      },
      orderBy: { date: 'desc' },
    });
  }

  async checkStatus(tenant_uuid: string, user_id: string, schedule_id: string, date: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id }
    });
    if (!teacher) return { has_checked_in: false };

    const existing = await this.prisma.teacherAttendance.findFirst({
      where: {
        tenant_uuid,
        teacher_id: teacher.id,
        schedule_id,
        date: new Date(date),
      }
    });

    return { has_checked_in: !!existing };
  }

  async checkIn(tenant_uuid: string, user_id: string, schedule_id: string, date: string, timestamp: string, image_base64?: string, latitude?: number, longitude?: number) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id }
    });
    if (!teacher) throw new BadRequestException('Akun guru tidak ditemukan');
    const teacher_id = teacher.id;

    // Timestamp validation (Anti-Replay Attack)
    const clientTime = new Date(timestamp).getTime();
    const serverTime = Date.now();
    const timeDiffMinutes = Math.abs(serverTime - clientTime) / (1000 * 60);
    
    // Reject if timestamp is older or newer than 2 minutes compared to server time
    if (timeDiffMinutes > 2) {
      throw new BadRequestException('Waktu tidak sinkron atau foto sudah kedaluwarsa. Pastikan jam HP Anda akurat dan coba lagi.');
    }

    // Face Recognition Check
    if (!teacher.face_descriptor) {
      throw new BadRequestException('Wajah belum terdaftar. Silakan daftarkan wajah Anda terlebih dahulu di profil.');
    }
    if (!image_base64) {
      throw new BadRequestException('Foto wajah wajib dikirimkan untuk validasi.');
    }

    const currentDescriptor = await this.faceRecognitionService.getDescriptorFromBase64(image_base64);
    const storedDescriptor = teacher.face_descriptor as number[];
    
    const distance = this.faceRecognitionService.compareDescriptors(storedDescriptor, currentDescriptor);
    // Typical threshold is 0.5 or 0.6. TinyFaceDetector might need a slightly relaxed threshold, like 0.6.
    if (distance > 0.6) {
      throw new BadRequestException('Wajah tidak cocok. Akses Ditolak!');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: schedule_id },
    });
    if (!schedule) throw new BadRequestException('Jadwal tidak ditemukan');

    const checkInTime = new Date(timestamp);
    // Convert to WIB (UTC+7) for time comparisons
    const checkInH = (checkInTime.getUTCHours() + 7) % 24;
    const checkInM = checkInTime.getUTCMinutes();
    const checkInTotalMins = checkInH * 60 + checkInM;

    const [startH, startM] = schedule.start_time.split(':').map(Number);
    const [endH, endM] = schedule.end_time.split(':').map(Number);
    const startTotalMins = startH * 60 + startM;
    const endTotalMins = endH * 60 + endM;

    // Allow check-in up to 10 minutes early
    if (checkInTotalMins < startTotalMins - 10) {
      throw new BadRequestException('Belum masuk jam pelajaran (terlalu awal)');
    }

    let notes = '';
    // Check if late (checked in after start time)
    if (checkInTotalMins > startTotalMins) {
      const diffMins = checkInTotalMins - startTotalMins;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      if (hours > 0) {
        notes = `Telat ${hours} jam ${mins} menit`;
      } else {
        notes = `Telat ${mins} menit`;
      }
    }

    return this.prisma.teacherAttendance.upsert({
      where: {
        teacher_id_schedule_id_date: {
          teacher_id,
          schedule_id,
          date: new Date(date),
        },
      },
      update: {
        status: 'hadir',
        check_in: checkInTime,
        notes: notes || null,
        latitude,
        longitude,
        face_image: image_base64,
      },
      create: {
        tenant_uuid,
        teacher_id,
        schedule_id,
        date: new Date(date),
        status: 'hadir',
        check_in: checkInTime,
        notes: notes || null,
        latitude,
        longitude,
        face_image: image_base64,
      },
    });
  }
}
