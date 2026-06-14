import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIncomeDto, UpdateIncomeDto } from './income.dto';

@Injectable()
export class IncomeService {
  constructor(private prisma: PrismaService) {}

  async create(tenant_uuid: string, dto: CreateIncomeDto) {
    return this.prisma.income.create({
      data: {
        ...dto,
        tenant_uuid,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async findAll(tenant_uuid: string, month?: string, page = 1, limit = 20) {
    const where: any = { tenant_uuid };

    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.income.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.income.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenant_uuid: string, id: string) {
    const item = await this.prisma.income.findFirst({ where: { id, tenant_uuid } });
    if (!item) throw new NotFoundException('Data pemasukan tidak ditemukan');
    return item;
  }

  async update(tenant_uuid: string, id: string, dto: UpdateIncomeDto) {
    await this.findOne(tenant_uuid, id);
    return this.prisma.income.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(tenant_uuid: string, id: string) {
    await this.findOne(tenant_uuid, id);
    return this.prisma.income.delete({ where: { id } });
  }

  async getSummary(tenant_uuid: string, month?: string) {
    const where: any = { tenant_uuid };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }

    const result = await this.prisma.income.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    });

    return {
      total: Number(result._sum.amount || 0),
      count: result._count,
    };
  }
}
