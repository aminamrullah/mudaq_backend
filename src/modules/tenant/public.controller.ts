import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from '../student/dto/student.dto';
import { normalizePhone } from '../../common/utils/phone.util';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('pesantren/:slug')
  @ApiOperation({ summary: 'Get pesantren info by slug for public PPDB' })
  async getPesantrenInfo(@Param('slug') slug: string) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        address: true,
        phone: true,
        logo: true,
        letterhead: true,
        landing_page_template: true,
        landing_page_config: true,
        ppdb_is_active: true,
      },
    });

    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    // Get active waves for this pesantren
    const now = new Date();
    const waves = await this.prisma.ppdbWave.findMany({
      where: {
        tenant_uuid: pesantren.id,
        is_active: true,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      include: {
        _count: {
          select: { students: true }
        }
      }
    });

    return {
      ...pesantren,
      active_waves: waves,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Lindungi dari DDoS (10 req/min)
  @Get('landing/:domain')
  @ApiOperation({ summary: 'Get landing page data by domain' })
  async getLandingPageByDomain(@Param('domain') domain: string) {
    // If domain is 'mudaq.id' or similar, we might want to return something else or handle it
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { domain },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        address: true,
        phone: true,
        logo: true,
        letterhead: true,
        description: true,
        landing_page_template: true,
        landing_page_config: true,
        addon_landing_page: true,
        posts: {
          where: { is_published: true },
          orderBy: { created_at: 'desc' },
          take: 6,
        },
      } as any,
    });

    if (!pesantren || !(pesantren as any).addon_landing_page) throw new NotFoundException('Landing page tidak ditemukan');
    return pesantren;
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('landing/:domain/posts/:postId')
  @ApiOperation({ summary: 'Get single blog post for public website' })
  async getPublicPost(@Param('domain') domain: string, @Param('postId') postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { 
        id: postId,
        is_published: true,
        pesantren: { domain: domain } // Strict tenant isolation
      }
    });

    if (!post) throw new NotFoundException('Artikel tidak ditemukan');
    return post;
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Maksimal 3 pendaftaran per menit dari IP yang sama
  @Post('pesantren/:slug/register')
  @ApiOperation({ summary: 'Register new student to a pesantren by slug (PPDB)' })
  async registerStudent(
    @Param('slug') slug: string,
    @Body() dto: CreateStudentDto,
  ) {
    // Validasi format slug: hanya huruf kecil, angka, dan strip
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException('Format slug tidak valid');
    }

    const pesantren = await this.prisma.pesantren.findUnique({
      where: { slug },
      select: { id: true, max_students: true, ppdb_is_active: true },
    });

    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    // ── PPDB Status Check ──
    if (!pesantren.ppdb_is_active) {
      throw new BadRequestException('Pendaftaran santri baru (PPDB) saat ini sedang ditutup.');
    }

    // ── PPDB Wave Check ──
    const now = new Date();
    const activeWave = await this.prisma.ppdbWave.findFirst({
      where: {
        tenant_uuid: pesantren.id,
        is_active: true,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      include: {
        _count: {
          select: { students: true }
        }
      }
    });

    if (!activeWave) {
      throw new BadRequestException('Tidak ada gelombang pendaftaran yang aktif saat ini.');
    }

    if (activeWave.quota > 0 && activeWave._count.students >= activeWave.quota) {
      throw new BadRequestException(`Kuota untuk ${activeWave.name} sudah penuh.`);
    }

    // Cek batas kapasitas total pesantren
    const currentStudents = await this.prisma.student.count({
      where: { tenant_uuid: pesantren.id, status: 'aktif' },
    });

    if (currentStudents >= pesantren.max_students) {
      throw new BadRequestException('Kapasitas pesantren sudah penuh');
    }

    // ── Phone Tenant Isolation Check ──
    if (dto.parent_phone) {
      const normalizedPhone = normalizePhone(dto.parent_phone);
      
      // Check User table
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: normalizedPhone },
      });
      if (existingUser && existingUser.tenant_uuid && existingUser.tenant_uuid !== pesantren.id) {
        throw new BadRequestException(`Nomor WhatsApp ${normalizedPhone} sudah terdaftar di pesantren lain.`);
      }

      // Check Student table
      const studentConflict = await this.prisma.student.findFirst({
        where: {
          parent_phone: normalizedPhone,
          tenant_uuid: { not: pesantren.id },
          deleted_at: null,
        },
      });
      if (studentConflict) {
        throw new BadRequestException(`Nomor WhatsApp ${normalizedPhone} sudah digunakan di pesantren lain.`);
      }
    }

    // Set status pendaftar baru
    const studentData: any = {
      ...dto,
      status: 'CALON', // Status khusus untuk yang baru daftar
      tenant_uuid: pesantren.id,
      ppdb_wave_id: activeWave.id,
    };

    // Convert date strings to Date objects for Prisma
    if (studentData.birth_date) {
      studentData.birth_date = new Date(studentData.birth_date);
    }
    if (studentData.graduation_date) {
      studentData.graduation_date = new Date(studentData.graduation_date);
    }

    const newStudent = await this.prisma.student.create({
      data: studentData,
    });

    return {
      message: 'Pendaftaran berhasil',
      student: newStudent,
    };
  }
}
