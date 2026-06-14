import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
  EmployeeCheckInDto,
  EmployeeCheckOutDto,
  EmployeePermissionDto,
  TeachingPermissionDto,
  OvertimeRequestDto,
  ApprovalDto,
} from './dto/employee.dto';
import { FaceRecognitionService } from '../teacher-attendance/face-recognition.service';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceService: FaceRecognitionService,
  ) {}

  // ---------------- HELPER: HAVERSINE FORMULA ----------------
  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // ---------------- WORK SCHEDULES ----------------
  async createSchedule(tenant_uuid: string, dto: CreateWorkScheduleDto) {
    return this.prisma.employeeWorkSchedule.create({
      data: {
        tenant_uuid,
        unit_id: dto.unit_id || null,
        name: dto.name,
        check_in_start: dto.check_in_start,
        check_in_end: dto.check_in_end,
        check_out_start: dto.check_out_start,
        check_out_end: dto.check_out_end,
        latitude: dto.latitude,
        longitude: dto.longitude,
        max_radius_meters: dto.max_radius_meters || 50,
      },
    });
  }

  async getSchedules(tenant_uuid: string) {
    return this.prisma.employeeWorkSchedule.findMany({
      where: { tenant_uuid },
      include: { unit: true },
    });
  }

  async updateSchedule(tenant_uuid: string, id: string, dto: UpdateWorkScheduleDto) {
    return this.prisma.employeeWorkSchedule.update({
      where: { id, tenant_uuid },
      data: {
        unit_id: dto.unit_id || null,
        name: dto.name,
        check_in_start: dto.check_in_start,
        check_in_end: dto.check_in_end,
        check_out_start: dto.check_out_start,
        check_out_end: dto.check_out_end,
        latitude: dto.latitude,
        longitude: dto.longitude,
        max_radius_meters: dto.max_radius_meters,
      },
    });
  }

  // ---------------- ATTENDANCE ----------------
  async checkIn(tenant_uuid: string, user_id: string, dto: EmployeeCheckInDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: user_id, tenant_uuid },
      include: { work_schedule: true },
    });

    if (!user) throw new BadRequestException('Akun tidak ditemukan');
    if (!user.is_work_attendance_required) {
      throw new BadRequestException('Anda tidak diwajibkan untuk absen kerja');
    }
    const schedule = user.work_schedule;
    if (!schedule) {
      throw new BadRequestException('Jadwal kerja belum diatur untuk akun Anda');
    }

    // 1. Validate Time
    const checkInTime = new Date(dto.date);
    const checkInH = (checkInTime.getUTCHours() + 7) % 24; // Convert to WIB
    const checkInM = checkInTime.getUTCMinutes();
    const checkInTotalMins = checkInH * 60 + checkInM;

    const [startH, startM] = schedule.check_in_start.split(':').map(Number);
    const [endH, endM] = schedule.check_in_end.split(':').map(Number);
    const startTotalMins = startH * 60 + startM;
    const endTotalMins = endH * 60 + endM;

    if (checkInTotalMins < startTotalMins) {
      throw new BadRequestException('Belum masuk jam mulai absen');
    }
    if (checkInTotalMins > endTotalMins) {
      // Allow late check-in but add notes? Or reject entirely?
      // Usually we allow but mark as late. Let's allow and mark late.
    }

    // 2. Validate Location if schedule has lat/lng
    if (schedule.latitude && schedule.longitude && dto.latitude && dto.longitude) {
      const distance = this.getDistanceMeters(
        schedule.latitude,
        schedule.longitude,
        dto.latitude,
        dto.longitude
      );
      if (distance > schedule.max_radius_meters) {
        throw new BadRequestException(`Anda berada di luar jangkauan area absen (${Math.round(distance)} meter dari titik pusat)`);
      }
    }

    // 3. Validate Face (for teachers mostly, but staff might need it too. Let's check if teacher)
    const teacher = await this.prisma.teacher.findFirst({ where: { user_id } });
    if (teacher && teacher.face_descriptor) {
      if (!dto.image_base64) throw new BadRequestException('Foto wajah wajib disertakan');
      const currentDescriptor = await this.faceService.getDescriptorFromBase64(dto.image_base64);
      const storedDescriptor = teacher.face_descriptor as number[];
      const faceDistance = this.faceService.compareDescriptors(storedDescriptor, currentDescriptor);
      if (faceDistance > 0.6) {
        throw new BadRequestException('Wajah tidak cocok. Akses ditolak!');
      }
    }

    // Insert or update
    const attendanceDate = new Date(dto.date);
    attendanceDate.setUTCHours(0,0,0,0); // normalize to midnight UTC for the day

    let notes = '';
    if (checkInTotalMins > endTotalMins) {
      notes = 'Terlambat';
    }

    return this.prisma.employeeAttendance.upsert({
      where: {
        user_id_date: {
          user_id,
          date: attendanceDate,
        },
      },
      update: {
        status: 'hadir',
        check_in_time: checkInTime,
        check_in_lat: dto.latitude,
        check_in_lng: dto.longitude,
        check_in_photo: dto.image_base64,
        notes: notes || null,
      },
      create: {
        tenant_uuid,
        user_id,
        date: attendanceDate,
        status: 'hadir',
        check_in_time: checkInTime,
        check_in_lat: dto.latitude,
        check_in_lng: dto.longitude,
        check_in_photo: dto.image_base64,
        notes: notes || null,
      },
    });
  }

  async checkOut(tenant_uuid: string, user_id: string, dto: EmployeeCheckOutDto) {
    const attendanceDate = new Date(dto.date);
    attendanceDate.setUTCHours(0,0,0,0);

    const attendance = await this.prisma.employeeAttendance.findFirst({
      where: { user_id, date: attendanceDate },
    });
    if (!attendance) {
      throw new BadRequestException('Anda belum absen masuk hari ini');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: user_id },
      include: { work_schedule: true },
    });
    const schedule = user?.work_schedule;
    if (schedule && schedule.latitude && schedule.longitude && dto.latitude && dto.longitude) {
      const distance = this.getDistanceMeters(
        schedule.latitude,
        schedule.longitude,
        dto.latitude,
        dto.longitude
      );
      if (distance > schedule.max_radius_meters) {
        throw new BadRequestException(`Anda berada di luar jangkauan area absen (${Math.round(distance)} meter dari titik pusat)`);
      }
    }

    // Note: Face validation could be repeated here if required, skipping for brevity unless specified.
    
    return this.prisma.employeeAttendance.update({
      where: { id: attendance.id },
      data: {
        check_out_time: new Date(dto.date),
        check_out_lat: dto.latitude,
        check_out_lng: dto.longitude,
        check_out_photo: dto.image_base64,
      },
    });
  }

  async getAttendanceHistory(tenant_uuid: string, user_id: string, month?: string) {
    const where: any = { tenant_uuid, user_id };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      where.date = { gte: start, lte: end };
    }
    return this.prisma.employeeAttendance.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { overtime: true },
    });
  }

  async getAllAttendance(tenant_uuid: string, date?: string) {
    const where: any = { tenant_uuid };
    if (date) {
      const d = new Date(date);
      d.setUTCHours(0,0,0,0);
      where.date = d;
    }
    return this.prisma.employeeAttendance.findMany({
      where,
      include: { user: { select: { name: true, role: true } }, overtime: true },
      orderBy: { date: 'desc' },
    });
  }

  // ---------------- OVERTIME ----------------
  async requestOvertime(tenant_uuid: string, user_id: string, dto: OvertimeRequestDto) {
    const date = new Date(dto.date);
    date.setUTCHours(0,0,0,0);

    const attendance = await this.prisma.employeeAttendance.findFirst({
      where: { user_id, date },
    });
    if (!attendance) {
      throw new BadRequestException('Tidak ada data kehadiran di tanggal ini untuk lembur');
    }

    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (diffHours <= 0) {
      throw new BadRequestException('Waktu mulai dan akhir tidak valid');
    }

    return this.prisma.employeeOvertime.create({
      data: {
        tenant_uuid,
        user_id,
        employee_attendance_id: attendance.id,
        date,
        start_time: start,
        end_time: end,
        duration_hours: diffHours,
        reason: dto.reason,
      },
    });
  }

  async approveOvertime(tenant_uuid: string, adminId: string, overtimeId: string, dto: ApprovalDto) {
    return this.prisma.employeeOvertime.update({
      where: { id: overtimeId, tenant_uuid },
      data: {
        status: dto.status,
        notes: dto.notes,
        approved_by: adminId,
      },
    });
  }

  // ---------------- PERMISSIONS ----------------
  async requestPermission(tenant_uuid: string, user_id: string, dto: EmployeePermissionDto) {
    return this.prisma.employeePermission.create({
      data: {
        tenant_uuid,
        user_id,
        type: dto.type,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        reason: dto.reason,
      },
    });
  }

  async requestTeachingPermission(tenant_uuid: string, user_id: string, dto: TeachingPermissionDto) {
    const teacher = await this.prisma.teacher.findFirst({ where: { user_id } });
    if (!teacher) throw new BadRequestException('Bukan akun guru');

    return this.prisma.teachingPermission.create({
      data: {
        tenant_uuid,
        teacher_id: teacher.id,
        schedule_id: dto.schedule_id || null,
        date: new Date(dto.date),
        reason: dto.reason,
      },
    });
  }

  async getAllPermissions(tenant_uuid: string, status?: string) {
    const where: any = { tenant_uuid };
    if (status) where.status = status;

    const employeePerms = await this.prisma.employeePermission.findMany({
      where,
      include: { user: { select: { name: true, role: true } } },
      orderBy: { created_at: 'desc' },
    });

    const teachingPerms = await this.prisma.teachingPermission.findMany({
      where,
      include: { 
        teacher: { select: { name: true } },
        schedule: { include: { subject: true, classroom: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return { employeePerms, teachingPerms };
  }

  async getOwnPermissions(tenant_uuid: string, user_id: string) {
    return this.prisma.employeePermission.findMany({
      where: { tenant_uuid, user_id },
      orderBy: { created_at: 'desc' },
    });
  }

  async getOwnTeachingPermissions(tenant_uuid: string, user_id: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { user_id } });
    if (!teacher) return [];

    return this.prisma.teachingPermission.findMany({
      where: { tenant_uuid, teacher_id: teacher.id },
      include: {
        schedule: { include: { subject: true, classroom: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async approvePermission(tenant_uuid: string, adminId: string, permId: string, dto: ApprovalDto) {
    const perm = await this.prisma.employeePermission.update({
      where: { id: permId, tenant_uuid },
      data: {
        status: dto.status,
        notes: dto.notes,
        approved_by: adminId,
      },
    });

    // If approved, insert attendance records as "izin"
    if (dto.status === 'approved') {
      const start = new Date(perm.start_date);
      const end = new Date(perm.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateObj = new Date(d);
        dateObj.setUTCHours(0,0,0,0);
        await this.prisma.employeeAttendance.upsert({
          where: { user_id_date: { user_id: perm.user_id, date: dateObj } },
          update: { status: 'izin' },
          create: {
            tenant_uuid,
            user_id: perm.user_id,
            date: dateObj,
            status: 'izin',
            notes: perm.reason,
          },
        });
      }
    }

    return perm;
  }

  async approveTeachingPermission(tenant_uuid: string, adminId: string, permId: string, dto: ApprovalDto) {
    const perm = await this.prisma.teachingPermission.update({
      where: { id: permId, tenant_uuid },
      data: {
        status: dto.status,
        notes: dto.notes,
        approved_by: adminId,
      },
    });

    if (dto.status === 'approved') {
      const dateObj = new Date(perm.date);
      dateObj.setUTCHours(0,0,0,0);
      
      // If schedule_id is specified, update only that schedule. 
      // Otherwise update/create for the date (though TeacherAttendance has a unique constraint on teacher_id + schedule_id + date).
      if (perm.schedule_id) {
        await this.prisma.teacherAttendance.upsert({
          where: {
            teacher_id_schedule_id_date: {
              teacher_id: perm.teacher_id,
              schedule_id: perm.schedule_id,
              date: dateObj,
            }
          },
          update: { status: 'izin' },
          create: {
            tenant_uuid,
            teacher_id: perm.teacher_id,
            schedule_id: perm.schedule_id,
            date: dateObj,
            status: 'izin',
            notes: perm.reason,
          }
        });
      }
    }

    return perm;
  }
}
