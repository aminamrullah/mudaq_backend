import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreatePpdbWaveDto, UpdatePpdbWaveDto } from './dto/ppdb-wave.dto';

@Injectable()
export class PpdbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService
  ) {}

  async findAll(tenantUuid: string) {
    const unitId = this.cls.get('unit_id');
    const whereClause: any = { tenant_uuid: tenantUuid };
    if (unitId) {
      whereClause.unit_ids = { has: unitId };
    }
    
    return this.prisma.ppdbWave.findMany({
      where: whereClause,
      orderBy: { start_date: 'asc' },
      include: {
        _count: {
          select: { students: true }
        }
      }
    });
  }

  async findOne(id: string, tenantUuid: string) {
    const unitId = this.cls.get('unit_id');
    const whereClause: any = { id, tenant_uuid: tenantUuid };
    if (unitId) {
      whereClause.unit_ids = { has: unitId };
    }

    const wave = await this.prisma.ppdbWave.findFirst({
      where: whereClause,
      include: {
        _count: {
          select: { students: true }
        }
      }
    });
    if (!wave) throw new NotFoundException('Gelombang tidak ditemukan');
    return wave;
  }

  async create(tenantUuid: string, dto: CreatePpdbWaveDto) {
    const unitId = this.cls.get('unit_id');
    
    if (dto.is_active) {
      const whereClause: any = { tenant_uuid: tenantUuid };
      if (unitId) {
        whereClause.unit_ids = { has: unitId };
      }
      await this.prisma.ppdbWave.updateMany({
        where: whereClause,
        data: { is_active: false }
      });
    }

    return this.prisma.ppdbWave.create({
      data: {
        ...dto,
        tenant_uuid: tenantUuid,
        unit_ids: unitId ? [unitId] : (dto.unit_ids || []),
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
      },
    });
  }

  async update(id: string, tenantUuid: string, dto: UpdatePpdbWaveDto) {
    await this.findOne(id, tenantUuid);
    const unitId = this.cls.get('unit_id');
    
    if (dto.is_active) {
      const whereClause: any = { tenant_uuid: tenantUuid, id: { not: id } };
      if (unitId) {
        whereClause.unit_ids = { has: unitId };
      }
      await this.prisma.ppdbWave.updateMany({
        where: whereClause,
        data: { is_active: false }
      });
    }
    
    const data: any = { ...dto };
    if (dto.start_date) data.start_date = new Date(dto.start_date);
    if (dto.end_date) data.end_date = new Date(dto.end_date);

    return this.prisma.ppdbWave.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantUuid: string) {
    const wave = await this.findOne(id, tenantUuid);
    
    if (wave._count.students > 0) {
      throw new BadRequestException('Gelombang tidak bisa dihapus karena sudah ada pendaftar');
    }

    return this.prisma.ppdbWave.delete({
      where: { id },
    });
  }

  async togglePpdbStatus(tenantUuid: string, isActive: boolean) {
    const unitId = this.cls.get('unit_id');
    if (unitId) {
      return this.prisma.educationUnit.update({
        where: { id: unitId },
        data: { ppdb_is_active: isActive },
      });
    }

    return this.prisma.pesantren.update({
      where: { id: tenantUuid },
      data: { ppdb_is_active: isActive },
    });
  }

  async getPpdbStatus(tenantUuid: string) {
    const unitId = this.cls.get('unit_id');
    if (unitId) {
      const unit = await this.prisma.educationUnit.findUnique({
        where: { id: unitId },
        select: { ppdb_is_active: true }
      });
      return { is_active: unit?.ppdb_is_active || false };
    }

    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { ppdb_is_active: true },
    });
    return { is_active: pesantren?.ppdb_is_active || false };
  }

  async getTenantWithAddon(tenantUuid: string) {
    return this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { addon_ppdb: true },
    });
  }
}
