import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

@Injectable()
export class TeacherService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  async create(tenantUuid: string, dto: CreateTeacherDto) {
    const { email, password, base_salary, ...teacherData } = dto;

    // --- Duplicate Check Across Units ---
    const duplicateConditions: any[] = [];
    if (teacherData.nip) {
      duplicateConditions.push({ nip: teacherData.nip });
    }
    if (teacherData.name) {
      duplicateConditions.push({ name: teacherData.name });
    }

    if (duplicateConditions.length > 0) {
      const existingTeacher = await this.prisma.teacher.findFirst({
        where: {
          tenant_uuid: tenantUuid,
          deleted_at: null,
          OR: duplicateConditions,
        },
        include: { unit: { select: { name: true } } }
      });

      if (existingTeacher) {
        const unitName = existingTeacher.unit?.name || 'Yayasan';
        throw new ConflictException(`Data guru (NIP atau Nama yang sama) sudah terdaftar di unit ${unitName}. Silakan gunakan fitur Tarik Data Ustadz Lintas Unit jika Anda Admin.`);
      }
    }

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
            unit_id: this.cls.get('unit_id') || undefined,
          },
        });
        userId = user.id;
      }

      return tx.teacher.create({
        data: {
          ...teacherData,
          tenant_uuid: tenantUuid,
          unit_id: this.cls.get('unit_id') || undefined,
          user_id: userId,
          birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
        },
      });
    });
  }

  async findAll(tenantUuid: string, page = 1, limit = 20, search?: string) {
    const where: any = { tenant_uuid: tenantUuid, deleted_at: null };
    
    const unitId = this.cls.get('unit_id');
    if (unitId) {
      where.OR = [
        { unit_id: unitId },
        { assigned_units: { some: { unit_id: unitId } } }
      ];
    }

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
    const unitId = this.cls.get('unit_id');
    
    const whereClause: any = { 
      id, 
      tenant_uuid: tenantUuid, 
      deleted_at: null,
    };

    if (unitId) {
      whereClause.OR = [
        { unit_id: unitId },
        { assigned_units: { some: { unit_id: unitId } } }
      ];
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: whereClause,
      include: {
        user: { select: { email: true, phone: true, role: true, base_salary: true } },
        classrooms: { select: { id: true, name: true } },
        tahfidz_students: { select: { id: true, name: true, nis: true } },
        quran_students: { select: { id: true, name: true, nis: true } },
        kitab_students: { select: { id: true, name: true, nis: true } },
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
      // Clear teacher fields for students assigned to this teacher
      await tx.student.updateMany({
        where: { tenant_uuid: tenantUuid, tahfidz_teacher_id: id },
        data: { tahfidz_teacher_id: null },
      });
      await tx.student.updateMany({
        where: { tenant_uuid: tenantUuid, quran_teacher_id: id },
        data: { quran_teacher_id: null },
      });
      await tx.student.updateMany({
        where: { tenant_uuid: tenantUuid, kitab_teacher_id: id },
        data: { kitab_teacher_id: null },
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
    
    // Also explicitly include the new fields if they aren't already included by default findFirst
    return teacher;
  }

  async assignStudents(tenantUuid: string, teacherId: string, dto: any) {
    const { student_ids, quran_student_ids, kitab_student_ids } = dto;
    // Verify teacher exists
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenant_uuid: tenantUuid, deleted_at: null },
    });
    if (!teacher) throw new NotFoundException('Guru tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      if (student_ids !== undefined) {
        await tx.student.updateMany({
          where: { tenant_uuid: tenantUuid, tahfidz_teacher_id: teacherId },
          data: { tahfidz_teacher_id: null },
        });
        if (student_ids.length > 0) {
          await tx.student.updateMany({
            where: { tenant_uuid: tenantUuid, id: { in: student_ids } },
            data: { tahfidz_teacher_id: teacherId },
          });
        }
      }

      if (quran_student_ids !== undefined) {
        await tx.student.updateMany({
          where: { tenant_uuid: tenantUuid, quran_teacher_id: teacherId },
          data: { quran_teacher_id: null },
        });
        if (quran_student_ids.length > 0) {
          await tx.student.updateMany({
            where: { tenant_uuid: tenantUuid, id: { in: quran_student_ids } },
            data: { quran_teacher_id: teacherId },
          });
        }
      }

      if (kitab_student_ids !== undefined) {
        await tx.student.updateMany({
          where: { tenant_uuid: tenantUuid, kitab_teacher_id: teacherId },
          data: { kitab_teacher_id: null },
        });
        if (kitab_student_ids.length > 0) {
          await tx.student.updateMany({
            where: { tenant_uuid: tenantUuid, id: { in: kitab_student_ids } },
            data: { kitab_teacher_id: teacherId },
          });
        }
      }
      
      return { success: true };
    });
  }

  async resetFace(tenantUuid: string, id: string) {
    const teacher = await this.findOne(tenantUuid, id);
    return this.prisma.teacher.update({
      where: { id: teacher.id },
      data: { face_descriptor: Prisma.DbNull },
    });
  }

  async searchGlobal(tenantUuid: string, search: string) {
    if (!search || search.length < 3) {
      return [];
    }
    const unitId = this.cls.get('unit_id');
    const teachers = await this.prisma.teacher.findMany({
      where: {
        tenant_uuid: tenantUuid,
        deleted_at: null,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nip: { contains: search, mode: 'insensitive' } }
        ]
      },
      include: {
        user: { select: { email: true, phone: true } },
        assigned_units: { select: { unit_id: true } }
      },
      take: 10
    });

    return teachers.map(t => ({
      ...t,
      is_already_in_unit: t.unit_id === unitId || t.assigned_units.some(au => au.unit_id === unitId)
    }));
  }

  async assignUnit(tenantUuid: string, teacherId: string) {
    const unitId = this.cls.get('unit_id');
    if (!unitId) throw new BadRequestException('Bukan admin unit');

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenant_uuid: tenantUuid, deleted_at: null }
    });
    if (!teacher) throw new NotFoundException('Guru tidak ditemukan');

    if (teacher.unit_id === unitId) {
      throw new ConflictException('Guru sudah berada di unit ini');
    }

    // Check pivot table
    const existingPivot = await this.prisma.teacherEducationUnit.findUnique({
      where: {
        teacher_id_unit_id: {
          teacher_id: teacherId,
          unit_id: unitId
        }
      }
    });

    if (existingPivot) {
      throw new ConflictException('Guru sudah ditugaskan ke unit ini');
    }

    await this.prisma.teacherEducationUnit.create({
      data: {
        teacher_id: teacherId,
        unit_id: unitId
      }
    });

    return { success: true, message: 'Guru berhasil ditarik ke unit ini' };
  }
}
