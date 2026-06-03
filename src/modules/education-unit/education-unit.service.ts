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
