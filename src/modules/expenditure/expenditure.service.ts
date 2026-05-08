import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenditureDto, UpdateExpenditureDto } from './expenditure.dto';

@Injectable()
export class ExpenditureService {
  constructor(private prisma: PrismaService) {}

  async create(tenant_uuid: string, dto: CreateExpenditureDto) {
    return this.prisma.expenditure.create({
      data: {
        ...dto,
        tenant_uuid,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async findAll(tenant_uuid: string, month?: string) {
    const where: any = { tenant_uuid };
    
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      
      where.date = {
        gte: start,
        lt: end,
      };
    }

    return this.prisma.expenditure.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(tenant_uuid: string, id: string) {
    const item = await this.prisma.expenditure.findFirst({
      where: { id, tenant_uuid },
    });
    if (!item) throw new NotFoundException('Expenditure not found');
    return item;
  }

  async update(tenant_uuid: string, id: string, dto: UpdateExpenditureDto) {
    await this.findOne(tenant_uuid, id);
    return this.prisma.expenditure.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(tenant_uuid: string, id: string) {
    await this.findOne(tenant_uuid, id);
    return this.prisma.expenditure.delete({
      where: { id },
    });
  }
}
