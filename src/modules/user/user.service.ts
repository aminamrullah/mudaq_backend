import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async create(tenantUuid: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
      },
    });
    if (existing)
      throw new ConflictException('Email atau telepon sudah terdaftar');

    const payload: any = {
      ...dto,
      tenant_uuid: tenantUuid,
      password: await bcrypt.hash(dto.password, 12),
      base_salary: dto.base_salary ? new Prisma.Decimal(dto.base_salary) : undefined,
      work_attendance_rate: dto.work_attendance_rate ? new Prisma.Decimal(dto.work_attendance_rate) : undefined,
      overtime_rate: dto.overtime_rate ? new Prisma.Decimal(dto.overtime_rate) : undefined,
    };
    if (payload.work_schedule_id === '') payload.work_schedule_id = null;

    if (!payload.koperasi_outlet_id) delete payload.koperasi_outlet_id;
    if (!payload.unit_id) delete payload.unit_id;

    if (dto.koperasi_outlet_id) payload.koperasi_outlet_id = dto.koperasi_outlet_id;
    if (dto.unit_id || this.cls.get('unit_id')) payload.unit_id = dto.unit_id || this.cls.get('unit_id');

    return this.prisma.user.create({
      data: payload,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        base_salary: true,
        created_at: true,
      },
    });
  }

  async findAll(tenantUuid: string | null, page = 1, limit = 50, role?: string, unitIdParam?: string) {
    const where: any = { deleted_at: null };
    if (tenantUuid) where.tenant_uuid = tenantUuid;
    if (role) where.role = role;

    const clsUnitId = this.cls.get('unit_id');
    if (clsUnitId) {
      where.unit_id = clsUnitId;
    } else if (unitIdParam) {
      where.unit_id = unitIdParam;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          is_active: true,
          base_salary: true,
          last_login_at: true,
          created_at: true,
          koperasi_outlet_id: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Attach students for WALI_SANTRI
    const enrichedData = await Promise.all(
      data.map(async (user) => {
        if (user.role === 'WALI_SANTRI' && user.phone) {
          const normalized = user.phone.replace(/[^0-9]/g, '');
          const variants = [
            normalized,
            normalized.startsWith('08') ? '628' + normalized.slice(2) : normalized,
            normalized.startsWith('628') ? '0' + normalized.slice(2) : normalized,
          ].filter((v, i, a) => a.indexOf(v) === i);

          const students = await this.prisma.student.findMany({
            where: {
              tenant_uuid: tenantUuid || undefined,
              parent_phone: { in: variants },
              deleted_at: null,
            },
            select: { id: true, name: true, nis: true },
          });
          return { ...user, students };
        }
        return user;
      }),
    );

    return {
      data: enrichedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantUuid: string | null, id: string) {
    const where: any = { id, deleted_at: null };
    if (tenantUuid) where.tenant_uuid = tenantUuid;
    
    const unitId = this.cls.get('unit_id');
    if (unitId) {
      where.unit_id = unitId;
    }

    const user = await this.prisma.user.findFirst({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        base_salary: true,
        created_at: true,
        koperasi_outlet_id: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  async update(tenantUuid: string, id: string, dto: UpdateUserDto) {
    await this.findOne(tenantUuid, id);
    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);
    if (dto.base_salary !== undefined) data.base_salary = new Prisma.Decimal(dto.base_salary);
    if (dto.work_attendance_rate !== undefined) data.work_attendance_rate = new Prisma.Decimal(dto.work_attendance_rate);
    if (dto.overtime_rate !== undefined) data.overtime_rate = new Prisma.Decimal(dto.overtime_rate);
    if (dto.work_schedule_id === '') data.work_schedule_id = null;
    
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, base_salary: true },
    });
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (existing) throw new ConflictException('Email sudah digunakan');
      data.email = dto.email;
    }
    if (dto.phone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id } },
      });
      if (existing) throw new ConflictException('Nomor telepon sudah digunakan');
      data.phone = dto.phone;
    }
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        tenant_uuid: true,
      },
    });
  }

  async remove(tenantUuid: string, id: string, requesterRole?: string) {
    const user = await this.findOne(tenantUuid, id);
    if (user.role === 'ADMIN_PESANTREN' && requesterRole !== 'SUPER_ADMIN') {
      throw new BadRequestException('Hanya Superadmin yang diperbolehkan menghapus akun Administrator utama');
    }
    const timestamp = Date.now();
    return this.prisma.user.update({
      where: { id },
      data: { 
        deleted_at: new Date(),
        is_active: false,
        phone: user.phone ? `${user.phone}_del_${timestamp}` : null,
        email: user.email ? `${user.email}_del_${timestamp}` : null,
      },
    });
  }

  // ── Notifications ──
  async getNotifications(userId: string) {
    return this.prisma.userNotification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(userId: string, notifId: string) {
    return this.prisma.userNotification.updateMany({
      where: { id: notifId, user_id: userId },
      data: { is_read: true },
    });
  }

  async markAllNotificationsRead(userId: string) {
    return this.prisma.userNotification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }
}
