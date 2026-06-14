import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEducationUnitDto, UpdateEducationUnitDto } from './dto/education-unit.dto';

@Injectable()
export class EducationUnitService {
  constructor(private prisma: PrismaService) {}

  async create(tenantUuid: string, dto: CreateEducationUnitDto) {
    return this.prisma.educationUnit.create({
      data: {
        ...dto,
        tenant_uuid: tenantUuid,
      },
    });
  }

  async findAll(tenantUuid: string) {
    return this.prisma.educationUnit.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { students: true, teachers: true, classrooms: true },
        },
      },
    });
  }

  async findAllCrossTenant(page = 1, limit = 20, search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tingkat: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.educationUnit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: { students: true, teachers: true, classrooms: true },
          },
          pesantren: {
            select: {
              id: true,
              name: true,
              slug: true,
              subscription_status: true,
            },
          },
        },
      }),
      this.prisma.educationUnit.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCentralReport(tenantUuid?: string) {
    const where: any = {};
    if (tenantUuid) {
      where.tenant_uuid = tenantUuid;
    }

    const units = await this.prisma.educationUnit.findMany({
      where,
      include: {
        _count: {
          select: { students: true, teachers: true, classrooms: true },
        },
        pesantren: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const [studentCount, teacherCount, billStats, transactionStats] = await Promise.all([
      this.prisma.student.groupBy({
        by: ['tenant_uuid'],
        where: { ...where, status: 'AKTIF' },
        _count: { id: true },
      }),
      this.prisma.teacher.groupBy({
        by: ['tenant_uuid'],
        where,
        _count: { id: true },
      }),
      this.prisma.bill.groupBy({
        by: ['tenant_uuid'],
        where: { status: { in: ['pending', 'overdue'] } },
        _sum: { amount: true, amount_paid: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['tenant_uuid'],
        where: { status: 'success' },
        _sum: { amount_paid: true, platform_fee: true },
        _count: { id: true },
      }),
    ]);

    const report = units.map(unit => {
      const billData = billStats.find(b => b.tenant_uuid === unit.tenant_uuid);
      const txData = transactionStats.find(t => t.tenant_uuid === unit.tenant_uuid);

      return {
        unit_id: unit.id,
        unit_name: unit.name,
        pesantren_name: unit.pesantren?.name,
        pesantren_slug: unit.pesantren?.slug,
        student_count: unit._count.students,
        teacher_count: unit._count.teachers,
        classroom_count: unit._count.classrooms,
        pending_bills: Number(billData?._sum?.amount || 0),
        total_transactions: txData?._count?.id || 0,
        total_revenue: Number(txData?._sum?.platform_fee || 0),
      };
    });

    return report;
  }

  async findOne(tenantUuid: string, id: string) {
    const unit = await this.prisma.educationUnit.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        _count: {
          select: { students: true, teachers: true, classrooms: true },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit pendidikan tidak ditemukan');
    }

    return unit;
  }

  async update(tenantUuid: string, id: string, dto: UpdateEducationUnitDto) {
    await this.findOne(tenantUuid, id);

    return this.prisma.educationUnit.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantUuid: string, id: string) {
    await this.findOne(tenantUuid, id);

    return this.prisma.educationUnit.delete({
      where: { id },
    });
  }
}