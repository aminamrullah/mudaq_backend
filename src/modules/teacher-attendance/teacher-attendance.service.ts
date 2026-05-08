import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherAttendanceDto, BulkTeacherAttendanceDto } from './dto/teacher-attendance.dto';

@Injectable()
export class TeacherAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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
}
