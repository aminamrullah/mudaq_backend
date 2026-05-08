import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTahfidzRecordDto, UpdateTahfidzRecordDto } from './dto/tahfidz.dto';

@Injectable()
export class TahfidzService {
  constructor(private prisma: PrismaService) {}

  async getRecords(tenantId: string, filters: any) {
    const { student_id, category, start_date, end_date } = filters;
    const where: any = { tenant_uuid: tenantId };

    if (student_id) where.student_id = student_id;
    if (category) where.category = category;
    if (start_date && end_date) {
      where.date = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    return this.prisma.tahfidzRecord.findMany({
      where,
      include: { student: true },
      orderBy: { date: 'desc' },
    });
  }

  async createRecord(tenantId: string, dto: CreateTahfidzRecordDto) {
    return this.prisma.tahfidzRecord.create({
      data: {
        tenant_uuid: tenantId,
        student_id: dto.student_id,
        teacher_id: dto.teacher_id,
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

  async updateRecord(id: string, dto: UpdateTahfidzRecordDto) {
    return this.prisma.tahfidzRecord.update({
      where: { id },
      data: dto,
    });
  }

  async deleteRecord(id: string) {
    return this.prisma.tahfidzRecord.delete({
      where: { id },
    });
  }
}
