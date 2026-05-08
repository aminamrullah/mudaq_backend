import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeachingJournalDto, UpdateTeachingJournalDto } from './dto/teaching-journal.dto';

@Injectable()
export class TeachingJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenant_uuid: string, role: string, userId: string, dto: CreateTeachingJournalDto) {
    let teacherId = dto.teacher_id;
    
    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid }
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      teacherId = teacher.id; // Force use their own ID
    }

    return this.prisma.teachingJournal.create({
      data: {
        tenant_uuid,
        teacher_id: teacherId,
        schedule_id: dto.schedule_id,
        date: new Date(dto.date),
        material: dto.material,
        student_count: dto.student_count || 0,
        notes: dto.notes,
      },
    });
  }

  async update(tenant_uuid: string, role: string, userId: string, id: string, dto: UpdateTeachingJournalDto) {
    const where: any = { id, tenant_uuid };

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid }
      });
      if (!teacher) throw new NotFoundException('Teacher profile not found');
      where.teacher_id = teacher.id;
    }

    const journal = await this.prisma.teachingJournal.findFirst({ where });

    if (!journal) {
      throw new NotFoundException('Teaching journal not found or access denied');
    }

    return this.prisma.teachingJournal.update({
      where: { id },
      data: {
        material: dto.material ?? journal.material,
        student_count: dto.student_count ?? journal.student_count,
        notes: dto.notes ?? journal.notes,
      },
    });
  }

  async findByTeacher(tenant_uuid: string, role: string, userId: string, teacher_id: string, month?: string) {
    let tid = teacher_id;

    if (role === 'USTAD') {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user_id: userId, tenant_uuid }
      });
      if (!teacher) return [];
      tid = teacher.id; // Force use their own ID
    }

    const where: any = { tenant_uuid, teacher_id: tid };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      where.date = { gte: start, lte: end };
    }

    return this.prisma.teachingJournal.findMany({
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

  async delete(tenant_uuid: string, id: string) {
    const journal = await this.prisma.teachingJournal.findFirst({
      where: { id, tenant_uuid },
    });

    if (!journal) {
      throw new NotFoundException('Teaching journal not found');
    }

    return this.prisma.teachingJournal.delete({
      where: { id },
    });
  }
}
