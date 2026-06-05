const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, 'src', 'modules', 'student', 'student.service.ts');
let content = fs.readFileSync(servicePath, 'utf-8');

const newMethods = `
  async searchGlobal(tenantUuid: string, search?: string, filterUnitId?: string, filterClassroomId?: string, filterStatus?: string) {
    if (!search && !filterUnitId && !filterClassroomId && !filterStatus) {
      return [];
    }
    if (search && search.length < 3 && !filterUnitId && !filterClassroomId && !filterStatus) {
      return [];
    }
    
    const currentUnitId = this.cls.get('unit_id');

    const students = await this.prisma.student.findMany({
      where: {
         tenant_uuid: tenantUuid,
         deleted_at: null,
         ...(currentUnitId ? {
            NOT: {
               registrations: { some: { unit_id: currentUnitId } }
            }
         } : {}),
         ...(search && search.length >= 3 ? {
            OR: [
               { name: { contains: search, mode: 'insensitive' } },
               { nik: { contains: search, mode: 'insensitive' } },
               { registrations: { some: { nis: { contains: search, mode: 'insensitive' } } } }
            ]
         } : {})
      },
      include: {
         registrations: {
            include: { unit: { select: { name: true } }, classroom: { select: { name: true } } }
         }
      },
      take: 100,
    });

    return students;
  }

  async cloneToUnit(tenantUuid: string, studentId: string) {
    const unitId = this.cls.get('unit_id');
    if (!unitId) throw new BadRequestException('Bukan admin unit');

    const source = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_uuid: tenantUuid, deleted_at: null },
    });

    if (!source) throw new NotFoundException('Santri sumber tidak ditemukan');

    const isRegistered = await this.prisma.studentRegistration.findFirst({
      where: { student_id: studentId, unit_id: unitId }
    });

    if (isRegistered) throw new ConflictException('Santri sudah terdaftar di unit ini');

    const cloned = await this.prisma.studentRegistration.create({
      data: {
        tenant_uuid: tenantUuid,
        student_id: studentId,
        unit_id: unitId,
        status: 'CALON', // Status awal di unit baru
        entry_year: new Date().getFullYear(),
      }
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

    const unitId = this.cls.get('unit_id');

    // Build the query on StudentRegistration, since filters like classroom_id, status, entry_year are there.
    const whereReg: any = { tenant_uuid: tenantUuid, student: { deleted_at: null } };
    
    if (search) {
      whereReg.OR = [
        { student: { name: { contains: search, mode: 'insensitive' } } },
        { nis: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (status) {
      if (status === 'AKTIF' || status === 'active') {
        whereReg.status = { in: ['AKTIF', 'active'] };
      } else {
        whereReg.status = status.toUpperCase();
      }
    }
    
    if (classroom_id) whereReg.classroom_id = classroom_id;
    // Dormitory is on Student and Registration? Wait, Dormitory is on Student in Prisma schema, but we can query through student
    if (dormitory_id) whereReg.student = { ...whereReg.student, dormitory_id };
    if (dormitory_room_id) whereReg.student = { ...whereReg.student, dormitory_room_id };
    
    if (tahfidz_teacher_id) whereReg.tahfidz_teacher_id = tahfidz_teacher_id;
    if (quran_teacher_id) whereReg.quran_teacher_id = quran_teacher_id;
    if (kitab_teacher_id) whereReg.kitab_teacher_id = kitab_teacher_id;
    if (entry_year) whereReg.entry_year = parseInt(entry_year);

    if (unitId) {
      whereReg.unit_id = unitId;
    } else {
      // If yayasan, we might want to group by student, or just show all registrations.
      // Usually, yayasan wants to see students and their registrations.
      // If we query StudentRegistration without unit filter, one student might appear multiple times (once per unit).
      // That's actually correct for a flat list, or they can filter by unit.
    }

    const orderByClause: any = {};
    if (sort) {
      if (sort === 'name') orderByClause.student = { name: order || 'asc' };
      else if (sort === 'entry_year') orderByClause.entry_year = order || 'desc';
      else if (sort === 'classroom') orderByClause.classroom = { name: order || 'asc' };
      else orderByClause[sort] = order || 'desc';
    } else {
      orderByClause.created_at = 'desc';
    }

    const [data, total, tenantInfo] = await Promise.all([
      this.prisma.studentRegistration.findMany({
        where: whereReg,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            include: {
              dormitory: { select: { id: true, name: true } },
              dormitory_room: { select: { id: true, name: true } },
              wallet: { select: { id: true, balance: true } },
            }
          },
          classroom: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
          ppdb_wave: { select: { id: true, name: true } },
        },
        orderBy: orderByClause,
      }),
      this.prisma.studentRegistration.count({ where: whereReg }),
      this.prisma.pesantren.findUnique({ where: { id: tenantUuid }, select: { max_students: true } }),
    ]);

    // Re-map to match frontend expectation where student fields are at the top level
    const formattedData = data.map(reg => {
       const { student, ...regData } = reg;
       return {
          ...student,
          ...regData,
          id: student.id, // Primary ID is student.id
          registration_id: reg.id,
       }
    });

    const total_all = await this.prisma.student.count({ where: { tenant_uuid: tenantUuid, deleted_at: null } });

    return {
      data: formattedData,
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
        registrations: {
           include: {
              unit: { select: { id: true, name: true } },
              classroom: true,
           }
        },
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

    // We no longer need to fetch linkedStudents because all units are in student.registrations
    const allAttendances = student.attendances;

    return {
      ...student,
      attendances: allAttendances,
      linked_units: student.registrations.map(r => r.unit).filter(Boolean)
    };
  }

  async update(tenantUuid: string, id: string, dto: UpdateStudentDto) {
    try {
      if (dto.parent_phone) {
        dto.parent_phone = normalizePhone(dto.parent_phone);
      }

      const existing = await this.prisma.student.findFirst({
        where: { id, tenant_uuid: tenantUuid, deleted_at: null },
      });

      if (!existing) {
        throw new NotFoundException('Santri tidak ditemukan');
      }

      // Phone uniqueness
      if (dto.parent_phone && dto.parent_phone !== existing.parent_phone) {
        await this.validateParentPhone(tenantUuid, dto.parent_phone);
      }

      return await this.prisma.$transaction(async (tx) => {
        const sanitizedData: any = { ...dto };
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
        
        const {
           unit_id, classroom_id, status, entry_year, graduation_date, nis, ppdb_wave_id, tahfidz_teacher_id, quran_teacher_id, kitab_teacher_id, academic_year_id,
           ...globalData
        } = sanitizedData;

        // Duplicate check
        const duplicateConditions: any[] = [];
        if (globalData.nik && globalData.nik !== existing.nik) {
          duplicateConditions.push({ nik: globalData.nik });
        }
        if (globalData.name && globalData.parent_phone && (globalData.name !== existing.name || globalData.parent_phone !== existing.parent_phone)) {
          duplicateConditions.push({ name: globalData.name, parent_phone: globalData.parent_phone });
        }
        
        if (duplicateConditions.length > 0) {
           const dup = await tx.student.findFirst({
              where: {
                 tenant_uuid: tenantUuid,
                 id: { not: id },
                 deleted_at: null,
                 OR: duplicateConditions
              }
           });
           if (dup) throw new ConflictException('Data duplikat: NIK atau Nama & No HP sudah dipakai santri lain');
        }

        const updatedStudent = await tx.student.update({
          where: { id },
          data: {
            ...globalData,
            birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
          },
        });

        // Update registration for the current unit
        const currentUnitId = this.cls.get('unit_id') || unit_id || null;
        let reg = await tx.studentRegistration.findFirst({
           where: { student_id: id, unit_id: currentUnitId }
        });

        if (reg) {
           await tx.studentRegistration.update({
              where: { id: reg.id },
              data: {
                 classroom_id,
                 status,
                 entry_year,
                 graduation_date,
                 nis,
                 ppdb_wave_id,
                 tahfidz_teacher_id,
                 quran_teacher_id,
                 kitab_teacher_id,
                 academic_year_id,
              }
           });
        } else {
           // Create registration if it somehow doesn't exist
           reg = await tx.studentRegistration.create({
              data: {
                 tenant_uuid: tenantUuid,
                 student_id: id,
                 unit_id: currentUnitId,
                 classroom_id,
                 status: status || 'CALON',
                 entry_year,
                 graduation_date,
                 nis,
                 ppdb_wave_id,
                 tahfidz_teacher_id,
                 quran_teacher_id,
                 kitab_teacher_id,
                 academic_year_id,
              }
           });
        }

        return updatedStudent;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Terdapat data duplikat (NIS/NIK/Phone)');
      }
      throw error;
    }
  }
`;

const startIdx = content.indexOf('  async searchGlobal(');
const endIdx = content.indexOf('  private async generateNextNis(');
if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + newMethods + '\n' + content.substring(endIdx);
    fs.writeFileSync(servicePath, content);
    console.log('Methods replaced successfully');
} else {
    console.error('Could not find boundaries');
}
