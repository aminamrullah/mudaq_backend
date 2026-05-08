import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '../../common/utils/phone.util';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(private prisma: PrismaService) {}

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

      return await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            ...data,
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

        // Auto-create/link Walisantri account if phone is provided
        if (data.parent_phone) {
          await this.ensureWalisantriAccount(tx, tenantUuid, data.parent_phone, student.name, data.parent_email);
        }

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

  async findAll(
    tenantUuid: string,
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    classroom_id?: string,
    dormitory_id?: string,
    dormitory_room_id?: string,
  ) {
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
        },
        orderBy: { created_at: 'desc' },
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
      const data = { ...dto };
      
      // Normalize status if provided
      if (data.status) {
        data.status = data.status === 'active' ? 'AKTIF' : data.status.toUpperCase();
      }

      if (data.parent_phone) {
        data.parent_phone = normalizePhone(data.parent_phone);
      }

      return await this.prisma.$transaction(async (tx) => {
        // Track changes for history
        if (data.status && data.status !== current.status) {
          await this.recordHistory(tx, tenantUuid, id, 'STATUS', current.status, data.status);
          if (data.status === 'ALUMNI' || data.status === 'BOYONG') {
            data.graduation_date = new Date().toISOString();
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

        // If parent_phone is updated, ensure the Wali account exists/is linked
        if (data.parent_phone) {
          await this.ensureWalisantriAccount(tx, tenantUuid, data.parent_phone, data.name || current.name, data.parent_email);
        }

        return await tx.student.update({
          where: { id },
          data: {
            ...data,
            birth_date: data.birth_date ? new Date(data.birth_date) : undefined,
            graduation_date: data.graduation_date ? new Date(data.graduation_date) : undefined,
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

  private async ensureWalisantriAccount(
    tx: Prisma.TransactionClient,
    tenantUuid: string,
    phone: string,
    studentName: string,
    email?: string,
  ) {
    const normalizedPhone = normalizePhone(phone);

    const existingUser = await tx.user.findFirst({
      where: { phone: normalizedPhone },
    });

    if (!existingUser) {
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
          `Nomor WhatsApp ${normalizedPhone} sudah terdaftar di pesantren lain. Satu nomor hanya dapat digunakan di satu pesantren.`,
        );
      }

      // If user exists but doesn't have a tenant (floating account), link it to this tenant
      if (!existingUser.tenant_uuid) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { tenant_uuid: tenantUuid },
        });
      }
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
    await this.findOne(tenantUuid, id);
    return this.prisma.student.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async importExcel(tenantUuid: string, file: Express.Multer.File) {
    const xlsx = require('xlsx');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const row of data as any[]) {
      try {
        const studentDto: CreateStudentDto = {
          name: row['Nama'] || row['name'],
          nis: row['NIS']?.toString() || row['nis']?.toString(),
          nisn: row['NISN']?.toString() || row['nisn']?.toString(),
          nik: row['NIK']?.toString() || row['nik']?.toString(),
          gender:
            row['Jenis Kelamin'] === 'Perempuan' || row['gender'] === 'P'
              ? 'P'
              : 'L',
          birth_place: row['Tempat Lahir'] || row['birth_place'],
          birth_date: row['Tanggal Lahir'] || row['birth_date'],
          address: row['Alamat'] || row['address'],
          father_name: row['Nama Ayah'] || row['father_name'],
          father_job: row['Pekerjaan Ayah'] || row['father_job'],
          mother_name: row['Nama Ibu'] || row['mother_name'],
          mother_job: row['Pekerjaan Ibu'] || row['mother_job'],
          parent_phone:
            row['No HP Wali']?.toString() || row['phone']?.toString(),
          status: 'AKTIF',
          // Optional physical data
          weight: row['Berat'] ? parseInt(row['Berat']) : undefined,
          height: row['Tinggi'] ? parseInt(row['Tinggi']) : undefined,
          last_education: row['Pendidikan Terakhir'] || row['last_education'],
          entry_year: row['Tahun Masuk'] ? parseInt(row['Tahun Masuk']) : undefined,
          // Address details
          province: row['Provinsi'] || row['province'],
          city: row['Kota'] || row['city'],
          district: row['Kecamatan'] || row['district'],
          village: row['Desa'] || row['village'],
        };

        await this.create(tenantUuid, studentDto);
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(
          `Baris ${row['Nama'] || 'Unknown'}: ${err.message}`,
        );
      }
    }

    return results;
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
}
