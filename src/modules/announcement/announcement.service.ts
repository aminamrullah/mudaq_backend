import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAnnouncementDto) {
    const { target_tenant_uuids, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          ...data,
          target_all: dto.target_all !== false, // default true
        },
      });

      if (dto.target_all === false && target_tenant_uuids && target_tenant_uuids.length > 0) {
        await tx.announcementTarget.createMany({
          data: target_tenant_uuids.map((uuid) => ({
            announcement_id: announcement.id,
            tenant_uuid: uuid,
          })),
        });
      }

      return announcement;
    });
  }

  async findAll() {
    return this.prisma.announcement.findMany({
      include: {
        targets: {
          include: {
            pesantren: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findActiveForTenant(tenantUuid: string) {
    return this.prisma.announcement.findMany({
      where: {
        is_active: true,
        OR: [
          { target_all: true },
          { targets: { some: { tenant_uuid: tenantUuid } } },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const { target_tenant_uuids, ...data } = dto;
    
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pengumuman tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.announcement.update({
        where: { id },
        data,
      });

      if (target_tenant_uuids) {
        await tx.announcementTarget.deleteMany({ where: { announcement_id: id } });
        if (dto.target_all === false && target_tenant_uuids.length > 0) {
          await tx.announcementTarget.createMany({
            data: target_tenant_uuids.map((uuid) => ({
              announcement_id: id,
              tenant_uuid: uuid,
            })),
          });
        }
      }

      return announcement;
    });
  }

  async remove(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}
