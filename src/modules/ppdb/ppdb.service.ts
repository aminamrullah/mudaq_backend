import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePpdbWaveDto, UpdatePpdbWaveDto } from './dto/ppdb-wave.dto';

@Injectable()
export class PpdbService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantUuid: string) {
    return this.prisma.ppdbWave.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { start_date: 'asc' },
      include: {
        _count: {
          select: { students: true }
        }
      }
    });
  }

  async findOne(id: string, tenantUuid: string) {
    const wave = await this.prisma.ppdbWave.findFirst({
      where: { id, tenant_uuid: tenantUuid },
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
    return this.prisma.ppdbWave.create({
      data: {
        ...dto,
        tenant_uuid: tenantUuid,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
      },
    });
  }

  async update(id: string, tenantUuid: string, dto: UpdatePpdbWaveDto) {
    await this.findOne(id, tenantUuid);
    
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
    return this.prisma.pesantren.update({
      where: { id: tenantUuid },
      data: { ppdb_is_active: isActive },
    });
  }

  async getPpdbStatus(tenantUuid: string) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { id: tenantUuid },
      select: { ppdb_is_active: true },
    });
    return { is_active: pesantren?.ppdb_is_active || false };
  }
}
