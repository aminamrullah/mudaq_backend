const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, 'src', 'modules', 'student', 'student.service.ts');
let content = fs.readFileSync(servicePath, 'utf-8');

// The new implementation of create method
const newCreate = `  async create(tenantUuid: string, dto: CreateStudentDto) {
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
        throw new BadRequestException(\`Batas maksimal santri (\${tenant.max_students}) untuk pesantren ini telah tercapai. Mohon hubungi Administrator platform untuk upgrade kuota.\`);
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
        
        let existingStudent = null;
        if (duplicateConditions.length > 0) {
          existingStudent = await tx.student.findFirst({
            where: {
              tenant_uuid: tenantUuid,
              deleted_at: null,
              OR: duplicateConditions,
            },
            include: { registrations: { include: { unit: true } } }
          });
        }

        const currentUnitId = this.cls.get('unit_id') || sanitizedData.unit_id || null;

        if (existingStudent) {
           // Check if already registered in THIS unit
           const isRegisteredInUnit = existingStudent.registrations.some(r => r.unit_id === currentUnitId);
           if (isRegisteredInUnit) {
              const unitName = existingStudent.registrations.find(r => r.unit_id === currentUnitId)?.unit?.name || 'Yayasan';
              throw new ConflictException(\`Data santri (NIK atau Nama & No HP yang sama) sudah terdaftar di unit \${unitName}. Silakan gunakan fitur Tarik Data Santri Lintas Unit jika Anda Admin, atau hubungi pihak sekolah.\`);
           }
        }

        // Extract unit specific fields
        const {
           unit_id, classroom_id, status, entry_year, graduation_date, nis, ppdb_wave_id, tahfidz_teacher_id, quran_teacher_id, kitab_teacher_id, academic_year_id,
           ...globalData
        } = sanitizedData;

        let student = existingStudent;

        if (!student) {
          student = await tx.student.create({
            data: {
              ...globalData,
              tenant_uuid: tenantUuid,
              birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
            },
          });
          
          // Auto-create wallet
          await tx.wallet.create({
            data: { tenant_uuid: tenantUuid, student_id: student.id, balance: 0 },
          });
        }

        // Create Registration Pivot
        const registration = await tx.studentRegistration.create({
           data: {
              tenant_uuid: tenantUuid,
              student_id: student.id,
              unit_id: currentUnitId,
              status: statusToUse,
              classroom_id,
              nis,
              entry_year,
              graduation_date,
              ppdb_wave_id,
              tahfidz_teacher_id,
              quran_teacher_id,
              kitab_teacher_id,
              academic_year_id,
           }
        });

        // Record initial history
        await this.recordHistory(tx, tenantUuid, student.id, 'STATUS', null, statusToUse, 'Pendaftaran awal/unit');
        if (classroom_id) await this.recordHistory(tx, tenantUuid, student.id, 'CLASSROOM', null, classroom_id);
        if (student.dormitory_id) await this.recordHistory(tx, tenantUuid, student.id, 'DORMITORY', null, student.dormitory_id);

        return { ...student, registrations: [registration] };
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
  }`;

// Find the boundaries of create method
const startCreate = content.indexOf('  async create(tenantUuid: string, dto: CreateStudentDto) {');
const endCreate = content.indexOf('  async searchGlobal(tenantUuid: string, search?: string, filterUnitId?: string, filterClassroomId?: string, filterStatus?: string) {');
if (startCreate !== -1 && endCreate !== -1) {
    content = content.substring(0, startCreate) + newCreate + '\n\n' + content.substring(endCreate);
} else {
    console.error('Could not find create method boundaries');
}

fs.writeFileSync(servicePath, content);
console.log('Updated create method');
