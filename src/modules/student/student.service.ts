import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto, UpdateStudentDto, BulkMutateStudentDto } from './dto/student.dto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '../../common/utils/phone.util';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) { }

  async create(tenantUuid: string, dto: CreateStudentDto) {
    try {
      const data = { ...dto };
      if (data.parent_phone) {
        data.parent_phone = normalizePhone(data.parent_phone);
      }

      // ── Limit Check ──
      const tenant = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { max_students: true }
      });

      const currentCount = await this.prisma.student.count({
        where: { tenant_uuid: tenantUuid, deleted_at: null }
      });

      if (tenant && currentCount >= tenant.max_students) {
        throw new BadRequestException(`Batas maksimal santri (${tenant.max_students}) untuk pesantren ini telah tercapai. Mohon hubungi Administrator platform untuk upgrade kuota.`);
      }

      // ── Phone Tenant Isolation Check ──
      if (data.parent_phone) {
        await this.validateParentPhone(tenantUuid, data.parent_phone);
      }

      return await this.prisma.$transaction(async (tx) => {
        // Sanitize empty UUID strings to null
        const sanitizedData: any = { ...data };
        const uuidFields = [
          'classroom_id',
          'dormitory_id',
          'dormitory_room_id',
          'academic_year_id',
          'tahfidz_teacher_id',
          'quran_teacher_id',
          'kitab_teacher_id',
        ];

        uuidFields.forEach((field) => {
          if (sanitizedData[field] === '') {
            sanitizedData[field] = null;
          }
        });

        const statusToUse = sanitizedData.status || 'CALON';
        if (statusToUse === 'CALON') {
          if (
            sanitizedData.classroom_id ||
            sanitizedData.dormitory_id ||
            sanitizedData.dormitory_room_id ||
            sanitizedData.tahfidz_teacher_id ||
            sanitizedData.quran_teacher_id ||
            sanitizedData.kitab_teacher_id
          ) {
            throw new BadRequestException('Santri dengan status CALON belum bisa dimasukkan ke kelas, asrama, atau wali kelas/guru.');
          }
        }

        // --- Duplicate Check Across Units ---
        const duplicateConditions: any[] = [];
        if (sanitizedData.nik) {
          duplicateConditions.push({ nik: sanitizedData.nik });
        }
        if (sanitizedData.name && sanitizedData.parent_phone) {
          duplicateConditions.push({ name: sanitizedData.name, parent_phone: sanitizedData.parent_phone });
        }
        
        if (duplicateConditions.length > 0) {
          const existingStudent = await tx.student.findFirst({
            where: {
              tenant_uuid: tenantUuid,
              deleted_at: null,
              OR: duplicateConditions,
            },
            include: { unit: { select: { name: true } } }
          });

          if (existingStudent) {
             const unitName = existingStudent.unit?.name || 'Yayasan';
             throw new ConflictException(`Data santri (NIK atau Nama & No HP yang sama) sudah terdaftar di unit ${unitName}. Silakan gunakan fitur Tarik Data Santri Lintas Unit jika Anda Admin, atau hubungi pihak sekolah.`);
          }
        }

        const student = await tx.student.create({
          data: {
            ...sanitizedData,
            tenant_uuid: tenantUuid,
            birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
            status: dto.status || 'CALON', // Default to CALON for new registrations
          },
        });

        // Record initial history
        await this.recordHistory(tx, tenantUuid, student.id, 'STATUS', null, student.status, 'Pendaftaran awal');
        if (student.classroom_id) await this.recordHistory(tx, tenantUuid, student.id, 'CLASSROOM', null, student.classroom_id);
        if (student.dormitory_id) await this.recordHistory(tx, tenantUuid, student.id, 'DORMITORY', null, student.dormitory_id);

        // Auto-create wallet
        await tx.wallet.create({
          data: { tenant_uuid: tenantUuid, student_id: student.id, balance: 0 },
        });

        // [MODIFIED] Auto-creation disabled. Walisantri must register manually and claim the student.
        // if (data.parent_phone) {
        //   await this.ensureWalisantriAccount(tx, tenantUuid, data.parent_phone, student.name, data.parent_email);
        // }

        return student;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[];
          if (target?.includes('nis')) {
            throw new ConflictException('NIS sudah terdaftar di pesantren ini');
          }
          if (target?.includes('nik')) {
            throw new ConflictException('NIK sudah terdaftar');
          }
          throw new ConflictException('Terdapat data duplikat (NIS/NIK/Phone)');
        }
      }
      this.logger.error('Failed to create student', error.stack);
      throw error;
    }
  }

  async searchGlobal(tenantUuid: string, search?: string, filterUnitId?: string, filterClassroomId?: string, filterStatus?: string) {
    if (!search && !filterUnitId && !filterClassroomId && !filterStatus) {
      return [];
    }
    if (search && search.length < 3 && !filterUnitId && !filterClassroomId && !filterStatus) {
      return [];
    }
    
    const currentUnitId = this.cls.get('unit_id');
    const whereClause: any = {
      tenant_uuid: tenantUuid,
      deleted_at: null,
      ...(currentUnitId ? { unit_id: { not: currentUnitId } } : {}),
    };

    if (filterUnitId) {
      // Override the unit_id NOT logic if they specifically search for a unit (though it should never be their own unit anyway)
      whereClause.unit_id = filterUnitId;
    }
    if (filterClassroomId) {
      whereClause.classroom_id = filterClassroomId;
    }
    if (filterStatus) {
      whereClause.status = filterStatus;
    }

    if (search && search.length >= 3) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nis: { contains: search, mode: 'insensitive' } },
        { nik: { contains: search, mode: 'insensitive' } },
      ];
    }

    const students = await this.prisma.student.findMany({
      where: whereClause,
      include: {
        classroom: { select: { name: true } },
        unit: { select: { name: true } },
      },
      take: 100, // Increased take to 100 for collective pull
    });

    return students;
  }

  async cloneToUnit(tenantUuid: string, studentId: string) {
    const unitId = this.cls.get('unit_id');
    if (!unitId) throw new BadRequestException('Bukan admin unit');

    const source = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_uuid: tenantUuid, deleted_at: null },
    });
    if (!source) throw new NotFoundException('Santri tidak ditemukan');

    // Check if already exists in this unit (by NIK or name + parent phone)
    const existingInUnit = await this.prisma.student.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        unit_id: unitId,
        deleted_at: null,
        OR: [
          ...(source.nik ? [{ nik: source.nik }] : []),
          { name: source.name, parent_phone: source.parent_phone },
        ],
      },
    });
    if (existingInUnit) {
      throw new ConflictException('Santri sudah terdaftar di unit ini');
    }

    // Clone the student data to new unit
    const cloned = await this.prisma.student.create({
      data: {
        tenant_uuid: tenantUuid,
        unit_id: unitId,
        name: source.name,
        nik: null, // NIK unique constraint — leave null for clone
        gender: source.gender,
        birth_place: source.birth_place,
        birth_date: source.birth_date,
        address: source.address,
        photo: source.photo,
        father_name: source.father_name,
        father_job: source.father_job,
        father_address: source.father_address,
        mother_name: source.mother_name,
        mother_job: source.mother_job,
        mother_address: source.mother_address,
        parent_phone: source.parent_phone,
        parent_email: source.parent_email,
        last_education: source.last_education,
        country: source.country,
        province: source.province,
        city: source.city,
        district: source.district,
        village: source.village,
        entry_year: new Date().getFullYear(),
        status: 'CALON',
      },
    });

    return { success: true, message: 'Santri berhasil ditarik ke unit ini', data: cloned };
  }

  async findAll(
    tenantUuid: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    classroom_id?: string,
    dormitory_id?: string,
    dormitory_room_id?: string,
    tahfidz_teacher_id?: string,
    quran_teacher_id?: string,
    kitab_teacher_id?: string,
    entry_year?: string,
    sort?: string,
    order?: string,
  ) {
    const sanitizeUuid = (val: any) => {
      if (val === 'undefined' || val === 'null' || val === '') return undefined;
      return val;
    };

    classroom_id = sanitizeUuid(classroom_id);
    dormitory_id = sanitizeUuid(dormitory_id);
    dormitory_room_id = sanitizeUuid(dormitory_room_id);
    tahfidz_teacher_id = sanitizeUuid(tahfidz_teacher_id);
    quran_teacher_id = sanitizeUuid(quran_teacher_id);
    kitab_teacher_id = sanitizeUuid(kitab_teacher_id);

    const where: any = { tenant_uuid: tenantUuid, deleted_at: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nis: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) {
      // Compatibility: if searching for active students, include both 'AKTIF' and 'active'
      if (status === 'AKTIF' || status === 'active') {
        where.status = { in: ['AKTIF', 'active'] };
      } else {
        where.status = status.toUpperCase();
      }
    }
    if (classroom_id) where.classroom_id = classroom_id;
    if (dormitory_id) where.dormitory_id = dormitory_id;
    if (dormitory_room_id) where.dormitory_room_id = dormitory_room_id;
    if (tahfidz_teacher_id) where.tahfidz_teacher_id = tahfidz_teacher_id;
    if (quran_teacher_id) where.quran_teacher_id = quran_teacher_id;
    if (kitab_teacher_id) where.kitab_teacher_id = kitab_teacher_id;
    if (entry_year) where.entry_year = parseInt(entry_year);

    // ADMIN_UNIT: only see students in their own unit
    const unitId = this.cls.get('unit_id');
    if (unitId) {
      where.unit_id = unitId;
    }

    const orderByClause: any = {};
    if (sort) {
      if (sort === 'name') orderByClause.name = order || 'asc';
      else if (sort === 'entry_year') orderByClause.entry_year = order || 'desc';
      else if (sort === 'classroom') orderByClause.classroom = { name: order || 'asc' };
      else orderByClause[sort] = order || 'desc';
    } else {
      orderByClause.created_at = 'desc';
    }

    const [data, total, total_all, tenantInfo] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          classroom: { select: { id: true, name: true } },
          dormitory: { select: { id: true, name: true } },
          dormitory_room: { select: { id: true, name: true } },
          wallet: { select: { id: true, balance: true } },
          ppdb_wave: { select: { id: true, name: true } },
        },
        orderBy: orderByClause,
      }),
      this.prisma.student.count({ where }),
      this.prisma.student.count({ where: { tenant_uuid: tenantUuid, deleted_at: null } }),
      this.prisma.pesantren.findUnique({ where: { id: tenantUuid }, select: { max_students: true } }),
    ]);

    return {
      data,
      meta: {
        total,
        total_all,
        max_quota: tenantInfo?.max_students || 0,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
    };
  }

  async findOne(tenantUuid: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenant_uuid: tenantUuid, deleted_at: null },
      include: {
        classroom: true,
        dormitory: true,
        dormitory_room: true,
        wallet: true,
        histories: { orderBy: { created_at: 'desc' } },
        bills: { orderBy: { due_date: 'desc' }, take: 20 },
        attendances: { orderBy: { date: 'desc' }, take: 50 },
        tahfidz_records: { orderBy: { date: 'desc' }, take: 20 },
        violations: { orderBy: { date: 'desc' } },
        health_records: { orderBy: { date: 'desc' } },
        student_permissions: { orderBy: { start_date: 'desc' } },
      },
    });
    if (!student) throw new NotFoundException('Santri tidak ditemukan');
    return student;
  }

  async update(tenantUuid: string, id: string, dto: UpdateStudentDto) {
    try {
      const current = await this.findOne(tenantUuid, id);
      const data: any = { ...dto };

      // Normalize status if provided
      if (data.status) {
        data.status = data.status === 'active' ? 'AKTIF' : data.status.toUpperCase();
      }

      if (data.parent_phone) {
        data.parent_phone = normalizePhone(data.parent_phone);
        if (data.parent_phone !== current.parent_phone) {
          await this.validateParentPhone(tenantUuid, data.parent_phone);
        }
      }

      return await this.prisma.$transaction(async (tx) => {
        // Track changes for history
        if (data.status && data.status !== current.status) {
          await this.recordHistory(tx, tenantUuid, id, 'STATUS', current.status, data.status);
          if (data.status === 'ALUMNI' || data.status === 'BOYONG' || data.status === 'KELUAR') {
            data.graduation_date = new Date().toISOString();
            data.classroom_id = null;
            data.dormitory_id = null;
            data.dormitory_room_id = null;
            data.tahfidz_teacher_id = null;
            data.quran_teacher_id = null;
            data.kitab_teacher_id = null;
          }
          // Auto NIS for new students being accepted
          if (data.status === 'AKTIF' && current.status === 'CALON') {
            if (!current.nis && !data.nis) {
              data.nis = await this.generateNextNis(tx, tenantUuid);
            }
            // Auto fill entry year if empty
            if (!current.entry_year && !data.entry_year) {
              data.entry_year = new Date().getFullYear();
            }
          }
        }
        if (data.classroom_id !== undefined && data.classroom_id !== current.classroom_id) {
          await this.recordHistory(tx, tenantUuid, id, 'CLASSROOM', current.classroom_id, data.classroom_id);
        }
        if (data.dormitory_id !== undefined && data.dormitory_id !== current.dormitory_id) {
          await this.recordHistory(tx, tenantUuid, id, 'DORMITORY', current.dormitory_id, data.dormitory_id);
        }
        if (data.dormitory_room_id !== undefined && data.dormitory_room_id !== current.dormitory_room_id) {
          await this.recordHistory(tx, tenantUuid, id, 'ROOM', current.dormitory_room_id, data.dormitory_room_id);
        }

        // [MODIFIED] Auto-creation/update disabled. Walisantri manages their own account.
        // const phoneToProcess = data.parent_phone || current.parent_phone;
        // if (phoneToProcess) {
        //   if (data.parent_phone && data.parent_phone !== current.parent_phone) {
        //     const normalizedNewPhone = normalizePhone(data.parent_phone);
        //     const normalizedOldPhone = current.parent_phone ? normalizePhone(current.parent_phone) : null;
        // 
        //     if (normalizedOldPhone) {
        //       // Check if any other student uses the old phone
        //       const otherStudentsCount = await tx.student.count({
        //         where: {
        //           tenant_uuid: tenantUuid,
        //           parent_phone: normalizedOldPhone,
        //           id: { not: id },
        //           deleted_at: null,
        //         },
        //       });
        // 
        //       if (otherStudentsCount === 0) {
        //         // No one else uses the old phone.
        //         const oldUser = await tx.user.findFirst({
        //           where: { phone: normalizedOldPhone, role: 'WALI_SANTRI', tenant_uuid: tenantUuid },
        //         });
        // 
        //         if (oldUser) {
        //           // Check if new phone is already taken
        //           const existingNewUser = await tx.user.findFirst({
        //             where: { phone: normalizedNewPhone },
        //           });
        // 
        //           if (!existingNewUser) {
        //             // New phone is free, update existing user
        //             const hashedPassword = await bcrypt.hash(normalizedNewPhone, 12);
        //             await tx.user.update({
        //               where: { id: oldUser.id },
        //               data: {
        //                 phone: normalizedNewPhone,
        //                 name: `Wali ${data.name || current.name}`,
        //                 password: hashedPassword,
        //                 email: (data.parent_email || oldUser.email || null) as any,
        //                 deleted_at: null,
        //                 is_active: true,
        //               },
        //             });
        //           } else {
        //             // New phone is already taken. Soft-delete the old user and link to the existing one.
        //             const timestamp = Date.now();
        //             await tx.user.update({
        //               where: { id: oldUser.id },
        //               data: {
        //                 deleted_at: new Date(),
        //                 is_active: false,
        //                 phone: oldUser.phone ? `${oldUser.phone}_del_${timestamp}` : null,
        //                 email: oldUser.email ? `${oldUser.email}_del_${timestamp}` : null,
        //               },
        //             });
        //             await this.ensureWalisantriAccount(tx, tenantUuid, normalizedNewPhone, data.name || current.name, data.parent_email);
        //           }
        //         } else {
        //           await this.ensureWalisantriAccount(tx, tenantUuid, normalizedNewPhone, data.name || current.name, data.parent_email);
        //         }
        //       } else {
        //         // Others use the old phone, just ensure the new one exists/is linked
        //         await this.ensureWalisantriAccount(tx, tenantUuid, normalizedNewPhone, data.name || current.name, data.parent_email);
        //       }
        //     } else {
        //       // No old phone, just ensure new one
        //       await this.ensureWalisantriAccount(tx, tenantUuid, normalizedNewPhone, data.name || current.name, data.parent_email);
        //     }
        //   } else {
        //     // Phone hasn't changed or wasn't provided in DTO (use current)
        //     const normalizedPhone = normalizePhone(phoneToProcess);
        //     await this.ensureWalisantriAccount(tx, tenantUuid, normalizedPhone, data.name || current.name, data.parent_email || current.parent_email || undefined);
        //   }
        // }

        // Sanitize empty UUID strings to null
        const sanitizedData: any = { ...data };
        const uuidFields = [
          'classroom_id',
          'dormitory_id',
          'dormitory_room_id',
          'academic_year_id',
          'tahfidz_teacher_id',
          'quran_teacher_id',
          'kitab_teacher_id',
        ];

        uuidFields.forEach((field) => {
          if (sanitizedData[field] === '') {
            sanitizedData[field] = null;
          }
        });

        const statusToUse = sanitizedData.status || current.status;
        if (statusToUse === 'CALON') {
          const hasAssignment =
            (sanitizedData.classroom_id !== undefined && sanitizedData.classroom_id !== null) ||
            (sanitizedData.dormitory_id !== undefined && sanitizedData.dormitory_id !== null) ||
            (sanitizedData.dormitory_room_id !== undefined && sanitizedData.dormitory_room_id !== null) ||
            (sanitizedData.tahfidz_teacher_id !== undefined && sanitizedData.tahfidz_teacher_id !== null) ||
            (sanitizedData.quran_teacher_id !== undefined && sanitizedData.quran_teacher_id !== null) ||
            (sanitizedData.kitab_teacher_id !== undefined && sanitizedData.kitab_teacher_id !== null);

          if (hasAssignment) {
            throw new BadRequestException('Santri dengan status CALON belum bisa dimasukkan ke kelas, asrama, atau wali kelas/guru.');
          }
        }

        return await tx.student.update({
          where: { id },
          data: {
            ...sanitizedData,
            birth_date: sanitizedData.birth_date ? new Date(sanitizedData.birth_date) : undefined,
            graduation_date: sanitizedData.graduation_date ? new Date(sanitizedData.graduation_date) : undefined,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Data gagal diperbarui: NIS atau NIK sudah digunakan santri lain',
          );
        }
      }
      throw error;
    }
  }

  private async generateNextNis(tx: Prisma.TransactionClient, tenantUuid: string): Promise<string> {
    const students = await tx.student.findMany({
      where: {
        tenant_uuid: tenantUuid,
        AND: [
          { nis: { not: null } },
          { nis: { not: '' } }
        ],
        deleted_at: null
      },
      select: { nis: true },
    });

    if (students.length === 0) return '10001';

    // Extract numeric parts and find max
    const nisNumbers = students
      .map(s => {
        const num = parseInt(s.nis?.replace(/\D/g, '') || '0');
        return isNaN(num) ? 0 : num;
      })
      .filter(n => n > 0);

    if (nisNumbers.length === 0) return '10001';

    const maxNis = Math.max(...nisNumbers);
    return (maxNis + 1).toString();
  }

  private async ensureWalisantriAccount(
    tx: Prisma.TransactionClient,
    tenantUuid: string,
    phone: string,
    studentName: string,
    email?: string,
  ) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;

    const existingUser = await tx.user.findFirst({
      where: { phone: normalizedPhone },
    });

    if (!existingUser) {
      this.logger.log(`Creating new Walisantri account for ${studentName} (${normalizedPhone})`);
      const hashedPassword = await bcrypt.hash(normalizedPhone, 12);
      await tx.user.create({
        data: {
          name: `Wali ${studentName}`,
          email: (email || null) as any,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'WALI_SANTRI',
          tenant_uuid: tenantUuid,
        },
      });
    } else {
      // User exists, check if it's from a different tenant
      if (existingUser.tenant_uuid && existingUser.tenant_uuid !== tenantUuid) {
        throw new ConflictException(
          `Nomor WhatsApp ${normalizedPhone} (Wali ${studentName}) sudah terdaftar di pesantren lain. Satu nomor WhatsApp hanya bisa digunakan di satu pesantren.`,
        );
      }

      // Also check if any student in ANOTHER tenant uses this phone
      const studentConflict = await tx.student.findFirst({
        where: {
          parent_phone: normalizedPhone,
          tenant_uuid: { not: tenantUuid },
          deleted_at: null,
        },
      });
      if (studentConflict) {
        throw new ConflictException(
          `Nomor WhatsApp ${normalizedPhone} sudah digunakan oleh santri di pesantren lain.`,
        );
      }

      // If user exists but was soft-deleted or doesn't have a tenant, reactivate/link it
      if (existingUser.deleted_at || !existingUser.tenant_uuid) {
        this.logger.log(`Linking existing user ${normalizedPhone} to tenant ${tenantUuid}`);
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            tenant_uuid: tenantUuid,
            deleted_at: null,
            is_active: true,
            role: existingUser.role || 'WALI_SANTRI'
          },
        });
      }
    }
  }

  private async validateParentPhone(tenantUuid: string, phone?: string) {
    if (!phone) return;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return;

    // Check if phone number is already used in a DIFFERENT tenant as a student parent_phone
    const otherStudent = await this.prisma.student.findFirst({
      where: {
        parent_phone: normalizedPhone,
        tenant_uuid: { not: tenantUuid },
        deleted_at: null,
      },
    });
    if (otherStudent) {
      throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} sudah digunakan oleh wali santri di pesantren lain.`);
    }

    // Check if phone number is already registered in a DIFFERENT tenant in User table
    const otherUser = await this.prisma.user.findFirst({
      where: {
        phone: normalizedPhone,
        tenant_uuid: { not: tenantUuid },
        deleted_at: null,
      },
    });
    if (otherUser) {
      throw new ConflictException(`Nomor WhatsApp ${normalizedPhone} sudah terdaftar di pesantren lain.`);
    }
  }

  private async recordHistory(
    tx: Prisma.TransactionClient,
    tenantUuid: string,
    studentId: string,
    type: string,
    fromValue: string | null,
    toValue: string | null,
    notes?: string,
  ) {
    if (fromValue === toValue) return;
    await tx.studentHistory.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        type,
        from_value: fromValue,
        to_value: toValue,
        notes,
      },
    });
  }

  async remove(tenantUuid: string, id: string) {
    const student = await this.findOne(tenantUuid, id);

    return await this.prisma.$transaction(async (tx) => {
      const timestamp = Date.now();

      // Soft delete student and free up unique fields
      const deletedStudent = await tx.student.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          nis: student.nis ? `${student.nis}_del_${timestamp}` : null,
          nisn: student.nisn ? `${student.nisn}_del_${timestamp}` : null,
          nik: student.nik ? `${student.nik}_del_${timestamp}` : null,
          parent_phone: student.parent_phone ? `${student.parent_phone}_del_${timestamp}` : null,
        },
      });

      // Also set wallet as inactive
      await tx.wallet.updateMany({
        where: { student_id: id },
        data: { is_active: false },
      });

      // Handle Walisantri account cleanup
      if (student.parent_phone) {
        const normalizedPhone = normalizePhone(student.parent_phone);

        // Check if any other ACTIVE student uses this phone
        const otherStudentsCount = await tx.student.count({
          where: {
            tenant_uuid: tenantUuid,
            parent_phone: normalizedPhone,
            id: { not: id },
            deleted_at: null,
          },
        });

        if (otherStudentsCount === 0) {
          // No other active students use this phone, soft-delete the walisantri user and free up phone/email
          const walisantri = await tx.user.findFirst({
            where: {
              phone: normalizedPhone,
              role: 'WALI_SANTRI',
              tenant_uuid: tenantUuid,
              deleted_at: null
            }
          });

          if (walisantri) {
            await tx.user.update({
              where: { id: walisantri.id },
              data: {
                deleted_at: new Date(),
                is_active: false,
                phone: walisantri.phone ? `${walisantri.phone}_del_${timestamp}` : null,
                email: walisantri.email ? `${walisantri.email}_del_${timestamp}` : null,
              },
            });
          }
        }
      }

      return deletedStudent;
    });
  }

  async importExcel(tenantUuid: string, file: Express.Multer.File) {
    const xlsx = require('xlsx');
    const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Helper to find value by multiple possible keys (case-insensitive, trimmed)
    const getValue = (row: any, keys: string[]) => {
      const rowKeys = Object.keys(row);
      for (const key of keys) {
        const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
        if (foundKey) return row[foundKey];
      }
      return undefined;
    };

    // Helper to format numeric values from Excel (handles scientific notation)
    const formatValue = (val: any): string | undefined => {
      if (val === undefined || val === null) return undefined;
      const str = val.toString().replace(/^'/, '');
      if (str.includes('E') || str.includes('e')) {
        const num = Number(val);
        if (!isNaN(num)) {
          return num.toLocaleString('fullwide', { useGrouping: false });
        }
      }
      return str.trim();
    };

    // Helper to safely parse dates (handles JS Dates, Excel serials, strings)
    const parseDate = (val: any): Date | undefined => {
      if (!val) return undefined;
      if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
      if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? undefined : d;
      }
      if (typeof val === 'string') {
        if (val.includes('-') || val.includes('/')) {
          const parts = val.split(/[-/]/);
          if (parts.length === 3) {
             let day, month, year;
             if (parts[0].length === 4) { // YYYY-MM-DD
                year = parseInt(parts[0]); month = parseInt(parts[1]) - 1; day = parseInt(parts[2]);
             } else { // DD-MM-YYYY
                day = parseInt(parts[0]); month = parseInt(parts[1]) - 1; year = parseInt(parts[2]);
                if (year < 100) year += 2000;
             }
             const d = new Date(year, month, day);
             if (!isNaN(d.getTime())) return d;
          }
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
      }
      return undefined;
    };

    for (const row of data as any[]) {
      try {
        const parsedBirthDate = parseDate(getValue(row, ['Tanggal Lahir', 'birth_date', 'DoB']));
        const studentDto: CreateStudentDto = {
          name: getValue(row, ['Nama', 'Nama Lengkap', 'name', 'Full Name']),
          nis: formatValue(getValue(row, ['NIS', 'nis', 'Nomor Induk'])),
          nisn: formatValue(getValue(row, ['NISN', 'nisn'])),
          nik: formatValue(getValue(row, ['NIK', 'nik', 'No. KTP'])) || '',
          gender: ['P', 'Perempuan', 'Female', 'Wanita', 'W'].includes(getValue(row, ['Jenis Kelamin', 'Gender', 'JK'])?.toString().trim().toUpperCase() || '') ? 'P' : 'L',
          birth_place: getValue(row, ['Tempat Lahir', 'birth_place', 'PoB']),
          birth_date: parsedBirthDate ? parsedBirthDate.toISOString() : '',
          address: getValue(row, ['Alamat', 'address', 'Home Address']),
          father_name: getValue(row, ['Nama Ayah', 'father_name', 'Father']),
          father_job: getValue(row, ['Pekerjaan Ayah', 'father_job', 'Father Job']),
          mother_name: getValue(row, ['Nama Ibu', 'mother_name', 'Mother']),
          mother_job: getValue(row, ['Pekerjaan Ibu', 'mother_job', 'Mother Job']),
          parent_phone: formatValue(getValue(row, ['No HP Wali', 'No. HP', 'WA Wali', 'phone', 'WhatsApp', 'HP', 'Telepon'])),
          parent_email: getValue(row, ['Email Wali', 'Email', 'parent_email'])?.toString(),
          status: 'AKTIF',
          // Optional physical data
          weight: parseInt(getValue(row, ['Berat', 'weight', 'BB']) || '0') || undefined,
          height: parseInt(getValue(row, ['Tinggi', 'height', 'TB']) || '0') || undefined,
          last_education: getValue(row, ['Pendidikan Terakhir', 'last_education', 'Education']),
          entry_year: parseInt(getValue(row, ['Tahun Masuk', 'entry_year', 'Angkatan']) || new Date().getFullYear().toString()),
          // Address details
          province: getValue(row, ['Provinsi', 'province']),
          city: getValue(row, ['Kota', 'city', 'Kabupaten']),
          district: getValue(row, ['Kecamatan', 'district']),
          village: getValue(row, ['Desa', 'village', 'Kelurahan']),
        };

        if (!studentDto.name) {
          throw new Error('Kolom Nama kosong atau tidak ditemukan');
        }
        if (!studentDto.nik) {
          throw new Error('Kolom NIK kosong atau tidak ditemukan');
        }
        if (!studentDto.birth_date) {
          throw new Error('Kolom Tanggal Lahir salah format atau tidak ditemukan');
        }
        if (!studentDto.mother_name) {
          throw new Error('Kolom Nama Ibu kosong atau tidak ditemukan');
        }

        await this.create(tenantUuid, studentDto);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(
          `Baris ${row['Nama'] || row['name'] || 'Tidak Diketahui'}: ${err.message}`,
        );
      }
    }

    return results;
  }

  generateTemplate(): Buffer {
    const xlsx = require('xlsx');
    const headers = [
      'Nama', 'NIS', 'NISN', 'NIK', 'Jenis Kelamin',
      'Tempat Lahir', 'Tanggal Lahir', 'Alamat',
      'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu',
      'No HP Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',
      'Tahun Masuk', 'Provinsi', 'Kota', 'Kecamatan', 'Desa'
    ];

    const sample = [
      'Ahmad Santri', '20260001', "'0012345678", "'1234567890123456", 'L',
      'Malang', '2010-05-15', 'Jl. Pesantren No. 123',
      'Bpk. Fulan', 'Wiraswasta', 'Ibu Fulanah', 'IRT',
      "'081234567890", 'SD/MI', '45', '160',
      '2026', 'Jawa Timur', 'Malang', 'Ngadiluwih', 'Purwokerto'
    ];

    const ws = xlsx.utils.aoa_to_sheet([headers, sample]);

    // Format columns properly
    const range = xlsx.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const header = headers[C];
      // Set column width for important fields
      if (['NIS', 'NISN', 'NIK', 'No HP Wali', 'Nama', 'Alamat'].includes(header)) {
        if (!ws['!cols']) ws['!cols'] = [];
        ws['!cols'][C] = { wch: 25 };
        
        // Attempt to set text format
        const cellRef = xlsx.utils.encode_cell({ r: 1, c: C });
        if (ws[cellRef]) {
          ws[cellRef].z = '@';
        }
      }
    }

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Template Santri");
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  // ── Health Records ──
  async getHealthRecords(tenantUuid: string, studentId: string) {
    return this.prisma.healthRecord.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { date: 'desc' },
    });
  }

  async createHealthRecord(tenantUuid: string, studentId: string, data: any) {
    return this.prisma.healthRecord.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        type: data.type,
        description: data.description,
        treatment: data.treatment,
        date: new Date(data.date),
      },
    });
  }

  // ── Violations ──
  async getViolations(tenantUuid: string, studentId: string) {
    return this.prisma.violation.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { date: 'desc' },
    });
  }

  async createViolation(tenantUuid: string, studentId: string, data: any) {
    return this.prisma.violation.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        type: data.type,
        description: data.description,
        points: Number(data.points),
        date: new Date(data.date),
      },
    });
  }

  // ── Permissions ──
  async getPermissions(tenantUuid: string, studentId: string) {
    return this.prisma.studentPermission.findMany({
      where: { tenant_uuid: tenantUuid, student_id: studentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async updatePermissionStatus(tenantUuid: string, permissionId: string, status: string) {
    return this.prisma.studentPermission.updateMany({
      where: { id: permissionId, tenant_uuid: tenantUuid },
      data: { status },
    });
  }

  async createPermission(tenantUuid: string, studentId: string, data: any) {
    return this.prisma.studentPermission.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        type: data.type,
        reason: data.reason,
        start_date: new Date(data.start_date),
        end_date: data.end_date ? new Date(data.end_date) : null,
        status: data.status || 'approved', // Default to approved for manual entry
      },
    });
  }

  async createTahfidzRecord(tenantUuid: string, studentId: string, data: any) {
    return this.prisma.tahfidzRecord.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        category: data.category || 'QURAN',
        title: data.title,
        from: data.from ? Number(data.from) : null,
        to: data.to ? Number(data.to) : null,
        juz: data.juz ? Number(data.juz) : null,
        type: data.type || 'setoran',
        status: data.status || 'lancar',
        date: new Date(data.date),
        notes: data.notes,
      },
    });
  }

  async bulkMutate(tenantUuid: string, dto: BulkMutateStudentDto) {
    const { student_ids, classroom_id, dormitory_id, dormitory_room_id, academic_year_id, status, notes } = dto;

    return await this.prisma.$transaction(async (tx) => {
      const results = [];
      const now = new Date();

      for (const studentId of student_ids) {
        const current = await tx.student.findFirst({
          where: { id: studentId, tenant_uuid: tenantUuid, deleted_at: null },
        });

        if (!current) continue;

        const updateData: any = {};

        // Track and Update Status
        if (status && status !== current.status) {
          const newStatus = status === 'active' ? 'AKTIF' : status.toUpperCase();
          if (newStatus !== current.status) {
            updateData.status = newStatus;
            await this.recordHistory(tx, tenantUuid, studentId, 'STATUS', current.status, newStatus, notes || 'Mutasi kolektif');
            if (newStatus === 'ALUMNI' || newStatus === 'BOYONG') {
              updateData.graduation_date = now;
            }
          }
        }

        // Track and Update Classroom
        if (classroom_id !== undefined && classroom_id !== current.classroom_id) {
          updateData.classroom_id = classroom_id === '' ? null : classroom_id;
          await this.recordHistory(tx, tenantUuid, studentId, 'CLASSROOM', current.classroom_id, updateData.classroom_id, notes || 'Mutasi kolektif');
        }

        // Track and Update Academic Year
        if (academic_year_id !== undefined && academic_year_id !== current.academic_year_id) {
          updateData.academic_year_id = academic_year_id === '' ? null : academic_year_id;
        }

        // Track and Update Dormitory
        if (dormitory_id !== undefined && dormitory_id !== current.dormitory_id) {
          updateData.dormitory_id = dormitory_id === '' ? null : dormitory_id;
          await this.recordHistory(tx, tenantUuid, studentId, 'DORMITORY', current.dormitory_id, updateData.dormitory_id, notes || 'Mutasi kolektif');
        }

        // Track and Update Room
        if (dormitory_room_id !== undefined && dormitory_room_id !== current.dormitory_room_id) {
          updateData.dormitory_room_id = dormitory_room_id === '' ? null : dormitory_room_id;
          await this.recordHistory(tx, tenantUuid, studentId, 'ROOM', current.dormitory_room_id, updateData.dormitory_room_id, notes || 'Mutasi kolektif');
        }

        if (Object.keys(updateData).length > 0) {
          const updated = await tx.student.update({
            where: { id: studentId },
            data: updateData,
          });
          results.push(updated);
        }
      }

      return {
        count: results.length,
        message: `${results.length} santri berhasil dimutasi.`,
      };
    });
  }
}
