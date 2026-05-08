import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDormitoryDto,
  UpdateDormitoryDto,
  CreateRoomDto,
  UpdateRoomDto,
} from './dto/dormitory.dto';

@Injectable()
export class DormitoryService {
  private readonly logger = new Logger(DormitoryService.name);
  constructor(private prisma: PrismaService) {}

  // ── Dormitory CRUD ──
  async create(tenantUuid: string, dto: CreateDormitoryDto) {
    const dorm = await this.prisma.dormitory.create({
      data: { ...dto, tenant_uuid: tenantUuid },
    });
    this.logger.log(`Dormitory created: ${dorm.name} (tenant: ${tenantUuid})`);
    return dorm;
  }

  async findAll(tenantUuid: string) {
    const dormitories = await this.prisma.dormitory.findMany({
      where: { tenant_uuid: tenantUuid },
      include: {
        rooms: {
          select: {
            id: true,
            name: true,
            capacity: true,
            _count: { select: { students: true } },
          },
        },
        _count: { select: { students: true, rooms: true } },
      },
      orderBy: { name: 'asc' },
    });
    return dormitories;
  }

  async findOne(tenantUuid: string, id: string) {
    const dorm = await this.prisma.dormitory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        rooms: { include: { _count: { select: { students: true } } } },
        students: {
          select: {
            id: true,
            name: true,
            nis: true,
            dormitory_room: { select: { name: true } },
          },
        },
        _count: { select: { students: true, rooms: true } },
      },
    });
    if (!dorm) throw new NotFoundException('Asrama tidak ditemukan');
    return dorm;
  }

  async update(tenantUuid: string, id: string, dto: UpdateDormitoryDto) {
    await this.findOne(tenantUuid, id);
    return this.prisma.dormitory.update({ where: { id }, data: dto });
  }

  async remove(tenantUuid: string, id: string) {
    await this.findOne(tenantUuid, id);
    return this.prisma.dormitory.delete({ where: { id } });
  }

  // ── Room CRUD ──
  async createRoom(
    tenantUuid: string,
    dormitoryId: string,
    dto: CreateRoomDto,
  ) {
    await this.findOne(tenantUuid, dormitoryId);
    return this.prisma.dormitoryRoom.create({
      data: { ...dto, dormitory_id: dormitoryId },
    });
  }

  async findRooms(tenantUuid: string, dormitoryId?: string) {
    const where: any = {};
    if (dormitoryId) {
      where.dormitory_id = dormitoryId;
      where.dormitory = { tenant_uuid: tenantUuid };
    } else {
      where.dormitory = { tenant_uuid: tenantUuid };
    }

    return this.prisma.dormitoryRoom.findMany({
      where,
      include: {
        dormitory: { select: { id: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async updateRoom(tenantUuid: string, roomId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.dormitoryRoom.findFirst({
      where: { id: roomId, dormitory: { tenant_uuid: tenantUuid } },
    });
    if (!room) throw new NotFoundException('Kamar tidak ditemukan');
    return this.prisma.dormitoryRoom.update({
      where: { id: roomId },
      data: dto,
    });
  }

  async removeRoom(tenantUuid: string, roomId: string) {
    const room = await this.prisma.dormitoryRoom.findFirst({
      where: { id: roomId, dormitory: { tenant_uuid: tenantUuid } },
    });
    if (!room) throw new NotFoundException('Kamar tidak ditemukan');
    return this.prisma.dormitoryRoom.delete({ where: { id: roomId } });
  }

  async findRoomOccupants(tenantUuid: string, roomId: string) {
    const room = await this.prisma.dormitoryRoom.findFirst({
      where: { id: roomId, dormitory: { tenant_uuid: tenantUuid } },
      include: { students: { select: { id: true, name: true, nis: true } } },
    });
    if (!room) throw new NotFoundException('Kamar tidak ditemukan');
    return room.students;
  }

  async assignStudentToRoom(
    tenantUuid: string,
    roomId: string,
    studentId: string,
  ) {
    const room = await this.prisma.dormitoryRoom.findFirst({
      where: { id: roomId, dormitory: { tenant_uuid: tenantUuid } },
      include: { _count: { select: { students: true } } },
    });
    if (!room) throw new NotFoundException('Kamar tidak ditemukan');

    // Check capacity
    if (room._count.students >= room.capacity) {
      throw new Error('Kamar sudah penuh (kapasitas: ' + room.capacity + ')');
    }

    return this.prisma.student.update({
      where: { id: studentId, tenant_uuid: tenantUuid },
      data: { dormitory_id: room.dormitory_id, dormitory_room_id: roomId },
    });
  }

  async unassignStudentFromRoom(tenantUuid: string, studentId: string) {
    return this.prisma.student.update({
      where: { id: studentId, tenant_uuid: tenantUuid },
      data: { dormitory_id: null, dormitory_room_id: null },
    });
  }
}
