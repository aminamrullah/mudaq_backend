import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  async create(tenantUuid: string, dto: CreateTeacherDto) {
    const { email, password, base_salary, ...teacherData } = dto;

    return this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;

      if (email && password) {
        // Check if user exists
        const existing = await tx.user.findFirst({ where: { email } });
        if (existing) throw new ConflictException('Email guru sudah terdaftar');

        const user = await tx.user.create({
          data: {
            tenant_uuid: tenantUuid,
            name: dto.name,
            email: email,
            password: await bcrypt.hash(password, 12),
            role: Role.USTAD,
            base_salary: dto.base_salary ? new Prisma.Decimal(dto.base_salary) : undefined,
          },
        });
        userId = user.id;
      }

      return tx.teacher.create({
        data: {
          ...teacherData,
          tenant_uuid: tenantUuid,
          user_id: userId,
          birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
        },
      });
    });
  }

  async findAll(tenantUuid: string, page = 1, limit = 20, search?: string) {
    const where: any = { tenant_uuid: tenantUuid, deleted_at: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, phone: true, role: true, base_salary: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.teacher.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantUuid: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenant_uuid: tenantUuid, deleted_at: null },
      include: {
        user: { select: { email: true, phone: true, role: true, base_salary: true } },
        classrooms: { select: { id: true, name: true } },
        tahfidz_students: { select: { id: true, name: true, nis: true } },
        schedules: {
          include: {
            subject: { select: { name: true } },
            classroom: { select: { name: true } },
          },
        },
      },
    });
    if (!teacher) throw new NotFoundException('Guru tidak ditemukan');
    return teacher;
  }

  async update(tenantUuid: string, id: string, dto: UpdateTeacherDto) {
    const teacher = await this.findOne(tenantUuid, id);
    const { base_salary, email, password, ...teacherData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (teacher.user_id) {
        const userUpdateData: any = {};
        if (base_salary !== undefined) {
          userUpdateData.base_salary = new Prisma.Decimal(base_salary);
        }
        if (email) {
          const existing = await tx.user.findFirst({
            where: { email, NOT: { id: teacher.user_id } },
          });
          if (existing) throw new ConflictException('Email guru sudah terdaftar');
          userUpdateData.email = email;
        }
        if (password) {
          userUpdateData.password = await bcrypt.hash(password, 12);
        }

        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: teacher.user_id },
            data: userUpdateData,
          });
        }
      } else if (email && password) {
        // Create user if not exists but credentials provided
        const existing = await tx.user.findFirst({ where: { email } });
        if (existing) throw new ConflictException('Email guru sudah terdaftar');

        const user = await tx.user.create({
          data: {
            tenant_uuid: tenantUuid,
            name: dto.name || teacher.name,
            email: email,
            password: await bcrypt.hash(password, 12),
            role: Role.USTAD,
            base_salary: base_salary ? new Prisma.Decimal(base_salary) : undefined,
          },
        });
        await tx.teacher.update({
          where: { id },
          data: { user_id: user.id },
        });
      }

      return tx.teacher.update({
        where: { id },
        data: {
          ...teacherData,
          birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
        },
      });
    });
  }

  async remove(tenantUuid: string, id: string) {
    const teacher = await this.findOne(tenantUuid, id);
    
    return this.prisma.$transaction(async (tx) => {
      // Clear tahfidz_teacher_id for students assigned to this teacher
      await tx.student.updateMany({
        where: { tenant_uuid: tenantUuid, tahfidz_teacher_id: id },
        data: { tahfidz_teacher_id: null },
      });

      const timestamp = Date.now();

      if (teacher.user_id) {
        await tx.user.update({
          where: { id: teacher.user_id },
          data: {
            deleted_at: new Date(),
            is_active: false,
            email: teacher.user?.email ? `${teacher.user.email}_del_${timestamp}` : null,
            phone: teacher.user?.phone ? `${teacher.user.phone}_del_${timestamp}` : null,
          }
        });
      }

      // Soft delete teacher
      return tx.teacher.update({
        where: { id },
        data: { 
          deleted_at: new Date(),
          nip: teacher.nip ? `${teacher.nip}_del_${timestamp}` : null,
          nik: teacher.nik ? `${teacher.nik}_del_${timestamp}` : null,
        },
      });
    });
  }

  async getProfile(tenantUuid: string, userId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { user_id: userId, tenant_uuid: tenantUuid, deleted_at: null },
      include: {
        user: { select: { email: true, role: true, name: true, phone: true } },
        classrooms: { select: { id: true, name: true } },
        pesantren: { select: { id: true, name: true, address: true, phone: true, logo: true, letterhead: true } },
      },
    });
    if (!teacher) throw new NotFoundException('Profil guru tidak ditemukan');
    return teacher;
  }

  async assignStudents(tenantUuid: string, teacherId: string, studentIds: string[]) {
    // Verify teacher exists
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenant_uuid: tenantUuid, deleted_at: null },
    });
    if (!teacher) throw new NotFoundException('Guru tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      // 1. Remove current assignments for this teacher
      await tx.student.updateMany({
        where: { tenant_uuid: tenantUuid, tahfidz_teacher_id: teacherId },
        data: { tahfidz_teacher_id: null },
      });

      // 2. Add new assignments
      if (studentIds.length > 0) {
        await tx.student.updateMany({
          where: { 
            tenant_uuid: tenantUuid, 
            id: { in: studentIds } 
          },
          data: { tahfidz_teacher_id: teacherId },
        });
      }
      
      return { success: true, count: studentIds.length };
    });
  }
}
