import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreateTahfidzRecordDto, UpdateTahfidzRecordDto } from './dto/tahfidz.dto';

@Injectable()
export class TahfidzService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService
  ) { }

  async getRecords(tenantId: string, filters: any, userId?: string, role?: string) {
    const { student_id, category, start_date, end_date } = filters;
    const where: any = { tenant_uuid: tenantId };

    if (student_id) where.student_id = student_id;
    if (category) where.category = category;

    if (role === 'USTAD' && userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { user_id: userId },
      });

      if (teacher) {
        if (category === 'QURAN') {
          if (!teacher.can_manage_quran) return []; // Not authorized for Quran
          where.student = { quran_teacher_id: teacher.id };
        } else if (category === 'KITAB' || category === 'NADHOM') {
          if (!teacher.can_manage_kitab) return []; // Not authorized for Kitab
          where.student = { kitab_teacher_id: teacher.id };
        } else {
          // General query by ustad, show students they guide in either
          where.student = {
            OR: [
              { quran_teacher_id: teacher.id },
              { kitab_teacher_id: teacher.id },
            ],
          };
        }
      }
    }

    if (start_date && end_date) {
      where.date = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    const unitId = this.cls.get('unit_id');
    if (unitId) {
      where.student = { ...where.student, unit_id: unitId };
    }

    return this.prisma.tahfidzRecord.findMany({
      where,
      include: { student: true },
      orderBy: { date: 'desc' },
    });
  }

  async createRecord(tenantId: string, dto: CreateTahfidzRecordDto, userId?: string, role?: string) {
    if (role === 'USTAD' && userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { user_id: userId },
      });

      if (!teacher) throw new Error('Teacher profile not found');

      // Check category permission
      if (dto.category === 'QURAN' && !teacher.can_manage_quran) {
        throw new Error('Anda tidak memiliki izin untuk mengelola hafalan Quran');
      }
      if ((dto.category === 'KITAB' || dto.category === 'NADHOM') && !teacher.can_manage_kitab) {
        throw new Error('Anda tidak memiliki izin untuk mengelola hafalan Kitab');
      }

      // Check student assignment
      const student = await this.prisma.student.findUnique({
        where: { id: dto.student_id },
      });

      if (!student) throw new Error('Santri tidak ditemukan');

      if (dto.category === 'QURAN' && student.quran_teacher_id !== teacher.id) {
        throw new Error('Santri ini bukan bimbingan Quran Anda');
      }
      if ((dto.category === 'KITAB' || dto.category === 'NADHOM') && student.kitab_teacher_id !== teacher.id) {
        throw new Error('Santri ini bukan bimbingan Kitab Anda');
      }
    }

    return this.prisma.tahfidzRecord.create({
      data: {
        tenant_uuid: tenantId,
        student_id: dto.student_id,
        teacher_id: dto.teacher_id || null,
        category: dto.category,
        title: dto.title,
        from: dto.from,
        to: dto.to,
        juz: dto.juz,
        type: dto.type,
        status: dto.status,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  async updateRecord(tenantId: string, id: string, dto: UpdateTahfidzRecordDto, userId?: string, role?: string) {
    const record = await this.prisma.tahfidzRecord.findUnique({
      where: { id },
      include: { student: true }
    });

    if (!record || record.tenant_uuid !== tenantId) {
      throw new Error('Data tidak ditemukan atau Anda tidak memiliki akses');
    }

    if (role === 'USTAD' && userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { user_id: userId },
      });

      if (!teacher) throw new Error('Profil guru tidak ditemukan');

      if (record.category === 'QURAN') {
        if (!teacher.can_manage_quran || record.student.quran_teacher_id !== teacher.id) {
          throw new Error('Anda tidak memiliki akses untuk mengubah record ini');
        }
      } else {
        if (!teacher.can_manage_kitab || record.student.kitab_teacher_id !== teacher.id) {
          throw new Error('Anda tidak memiliki akses untuk mengubah record ini');
        }
      }
    }

    const data: any = { ...dto };
    if (data.teacher_id === '') data.teacher_id = null;

    return this.prisma.tahfidzRecord.update({
      where: { id },
      data,
    });
  }

  async deleteRecord(tenantId: string, id: string, userId?: string, role?: string) {
    const record = await this.prisma.tahfidzRecord.findUnique({
      where: { id },
      include: { student: true }
    });

    if (!record || record.tenant_uuid !== tenantId) {
      throw new Error('Data tidak ditemukan atau Anda tidak memiliki akses');
    }

    if (role === 'USTAD' && userId) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { user_id: userId },
      });

      if (!teacher) throw new Error('Profil guru tidak ditemukan');

      if (record.category === 'QURAN') {
        if (!teacher.can_manage_quran || record.student.quran_teacher_id !== teacher.id) {
          throw new Error('Anda tidak memiliki akses untuk menghapus record ini');
        }
      } else {
        if (!teacher.can_manage_kitab || record.student.kitab_teacher_id !== teacher.id) {
          throw new Error('Anda tidak memiliki akses untuk menghapus record ini');
        }
      }
    }

    return this.prisma.tahfidzRecord.delete({
      where: { id },
    });
  }
}
