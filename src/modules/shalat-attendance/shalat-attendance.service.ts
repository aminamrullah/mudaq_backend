import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateShalatAttendanceDto } from './dto/create-shalat-attendance.dto';
import { UpdateShalatAttendanceDto } from './dto/update-shalat-attendance.dto';
import { ScanRfidDto } from './dto/scan-rfid.dto';

@Injectable()
export class ShalatAttendanceService {
  constructor(private prisma: PrismaService) {}

  async bulkCreate(tenant_uuid: string, dto: CreateShalatAttendanceDto) {
    const { shalat_name, date, attendances } = dto;
    const dateObj = new Date(date);

    // Filter valid students
    const validAttendances = attendances.filter((a) => a.status);
    
    if (validAttendances.length === 0) {
      throw new BadRequestException('No attendance data provided');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const record of validAttendances) {
        const existing = await tx.shalatAttendance.findUnique({
          where: {
            student_id_shalat_name_date: {
              student_id: record.student_id,
              shalat_name,
              date: dateObj,
            },
          },
        });

        if (existing) {
          await tx.shalatAttendance.update({
            where: { id: existing.id },
            data: { status: record.status, notes: record.notes },
          });
          updatedCount++;
        } else {
          await tx.shalatAttendance.create({
            data: {
              tenant_uuid,
              student_id: record.student_id,
              shalat_name,
              date: dateObj,
              status: record.status,
              notes: record.notes,
            },
          });
          createdCount++;
        }
      }
      return { createdCount, updatedCount };
    });

    return {
      message: 'Shalat attendance processed successfully',
      data: result,
    };
  }

  async scanRfid(tenant_uuid: string, dto: ScanRfidDto) {
    const student = await this.prisma.student.findFirst({
      where: {
        tenant_uuid,
        rfid: dto.rfid,
        status: { in: ['AKTIF', 'active'] },
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        nis: true,
        photo: true,
        classroom: { select: { name: true } },
      },
    });

    if (!student) {
      throw new BadRequestException('Santri dengan kartu RFID tersebut tidak ditemukan atau tidak aktif.');
    }

    // Default to today if date is not provided
    let dateObj = new Date();
    if (dto.date) {
      dateObj = new Date(dto.date);
    }
    // Set time to 00:00:00 to match Date column semantics
    dateObj.setHours(0, 0, 0, 0);

    const existing = await this.prisma.shalatAttendance.findUnique({
      where: {
        student_id_shalat_name_date: {
          student_id: student.id,
          shalat_name: dto.shalat_name,
          date: dateObj,
        },
      },
    });

    if (existing) {
      await this.prisma.shalatAttendance.update({
        where: { id: existing.id },
        data: { status: 'jamaah' },
      });
    } else {
      await this.prisma.shalatAttendance.create({
        data: {
          tenant_uuid,
          student_id: student.id,
          shalat_name: dto.shalat_name,
          date: dateObj,
          status: 'jamaah',
        },
      });
    }

    return {
      message: 'Berhasil melakukan absensi',
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        photo: student.photo,
        classroom_name: student.classroom?.name,
      },
    };
  }

  async findByDateAndShalat(tenant_uuid: string, date: string, shalat_name?: string, classroom_id?: string) {
    const dateObj = new Date(date);
    
    // Construct filter for student if classroom_id is provided
    const studentFilter = classroom_id ? { classroom_id } : {};

    return this.prisma.shalatAttendance.findMany({
      where: {
        tenant_uuid,
        date: dateObj,
        ...(shalat_name && { shalat_name }),
        student: studentFilter
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            classroom: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: {
        student: { name: 'asc' }
      }
    });
  }

  async getStudentHistory(tenant_uuid: string, student_id: string, month?: string) {
    let dateFilter = {};
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      dateFilter = {
        date: {
          gte: start,
          lte: end,
        },
      };
    }

    return this.prisma.shalatAttendance.findMany({
      where: {
        tenant_uuid,
        student_id,
        ...dateFilter,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  async getSummary(tenant_uuid: string, date: string) {
    const dateObj = new Date(date);
    const records = await this.prisma.shalatAttendance.findMany({
      where: { tenant_uuid, date: dateObj }
    });

    const summary = records.reduce((acc, curr) => {
      if (!acc[curr.shalat_name]) {
        acc[curr.shalat_name] = { jamaah: 0, munfarid: 0, izin: 0, sakit: 0, alpha: 0, haid: 0 };
      }
      if (acc[curr.shalat_name][curr.status] !== undefined) {
        acc[curr.shalat_name][curr.status]++;
      }
      return acc;
    }, {} as Record<string, any>);

    return summary;
  }
}
