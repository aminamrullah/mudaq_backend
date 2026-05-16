import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAttendanceDto, BulkAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  constructor(private prisma: PrismaService) {}

  async create(tenantUuid: string, dto: CreateAttendanceDto) {
    const scheduleId = dto.schedule_id || null;
    return this.prisma.attendance.upsert({
      where: {
        student_id_schedule_id_date: {
          student_id: dto.student_id,
          schedule_id: scheduleId as any,
          date: new Date(dto.date),
        },
      },
      update: { status: dto.status, notes: dto.notes },
      create: {
        tenant_uuid: tenantUuid,
        student_id: dto.student_id,
        schedule_id: scheduleId,
        date: new Date(dto.date),
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  async bulkCreate(tenantUuid: string, dto: BulkAttendanceDto) {
    const scheduleId = dto.schedule_id || null;
    const results = await this.prisma.$transaction(async (tx) => {
      // 1. Mark student attendance
      const studentAtt = await Promise.all(
        dto.items.map((item) =>
          tx.attendance.upsert({
            where: {
              student_id_schedule_id_date: {
                student_id: item.student_id,
                schedule_id: scheduleId as any,
                date: new Date(dto.date),
              },
            },
            update: { status: item.status, notes: item.notes },
            create: {
              tenant_uuid: tenantUuid,
              student_id: item.student_id,
              schedule_id: scheduleId,
              date: new Date(dto.date),
              status: item.status,
              notes: item.notes,
            },
          }),
        ),
      );

      // 2. Automatically mark teacher as 'hadir' if schedule_id is provided
      if (dto.schedule_id) {
        const schedule = await tx.schedule.findUnique({
          where: { id: dto.schedule_id },
          select: { teacher_id: true },
        });

        if (schedule && schedule.teacher_id) {
          const status = dto.teacher_status || 'hadir';
          await tx.teacherAttendance.upsert({
            where: {
              teacher_id_schedule_id_date: {
                teacher_id: schedule.teacher_id,
                schedule_id: dto.schedule_id,
                date: new Date(dto.date),
              },
            },
            update: { status, check_in: new Date() },
            create: {
              tenant_uuid: tenantUuid,
              teacher_id: schedule.teacher_id,
              schedule_id: dto.schedule_id,
              date: new Date(dto.date),
              status,
              check_in: new Date(),
            },
          });
        }
      }

      return studentAtt;
    });

    this.logger.log(
      `Bulk attendance: ${results.length} records for tenant ${tenantUuid}. Teacher also marked present.`,
    );
    return { count: results.length };
  }

  async findByDate(tenantUuid: string, date: string, classroomId?: string, scheduleId?: string) {
    const where: any = { tenant_uuid: tenantUuid, date: new Date(date) };
    if (classroomId) where.student = { classroom_id: classroomId };
    if (scheduleId) where.schedule_id = scheduleId;
    return this.prisma.attendance.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            classroom: { select: { name: true } },
          },
        },
      },
      orderBy: { student: { name: 'asc' } },
    });
  }

  async getStudentAttendance(
    tenantUuid: string,
    studentId: string,
    month?: string,
  ) {
    const where: any = { tenant_uuid: tenantUuid, student_id: studentId };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }
    return this.prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async getSummary(tenantUuid: string, month: string) {
    const start = new Date(`${month}-01`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const records = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { tenant_uuid: tenantUuid, date: { gte: start, lt: end } },
      _count: { _all: true },
    });
    return records.map((r) => ({ 
      status: r.status, 
      count: (r as any)._count._all || 0 
    }));
  }
}
