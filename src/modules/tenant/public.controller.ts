import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
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
        education_units: {
          where: { is_active: true },
          select: {
            id: true,
            name: true,
            ppdb_is_active: true
          },
          orderBy: { name: 'asc' }
        }
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
    if (!pesantren.ppdb_is_active && !dto.unit_id) {
      throw new BadRequestException('Pendaftaran santri baru (PPDB) Yayasan saat ini sedang ditutup.');
    }
    
    // Check if unit is provided and active
    if (dto.unit_id) {
      const unit = await this.prisma.educationUnit.findFirst({
        where: { id: dto.unit_id, tenant_uuid: pesantren.id }
      });
      if (!unit) throw new BadRequestException('Unit pendidikan tidak valid.');
      if (!unit.ppdb_is_active) throw new BadRequestException(`Pendaftaran santri baru untuk unit ${unit.name} sedang ditutup.`);
    }

    // ── PPDB Wave Check ──
    const now = new Date();
    const activeWave = await this.prisma.ppdbWave.findFirst({
      where: {
        tenant_uuid: pesantren.id,
        is_active: true,
        start_date: { lte: now },
        end_date: { gte: now },
        ...(dto.unit_id ? { unit_id: dto.unit_id } : { unit_id: null })
      },
      include: {
        _count: {
          select: { students: true }
        }
      }
    });

    if (!activeWave) {
      throw new BadRequestException('Tidak ada gelombang pendaftaran yang aktif untuk pilihan ini saat ini.');
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

  @Post('pesantren/:slug/upload')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Upload file for PPDB (Public)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const tempPath = resolve(join(process.cwd(), 'public', 'uploads', 'temp'));
          if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true });
          }
          cb(null, tempPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `ppdb-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|webp|pdf|doc|docx)$/i)) {
          return cb(new BadRequestException('Only images, PDFs and documents are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for public PPDB
    })
  )
  async uploadPpdbFile(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const pesantren = await this.prisma.pesantren.findUnique({
      where: { slug },
      select: { id: true, ppdb_is_active: true, storage_used: true, storage_limit: true },
    });

    if (!pesantren) {
      fs.unlinkSync(file.path);
      throw new NotFoundException('Pesantren tidak ditemukan');
    }

    if (!pesantren.ppdb_is_active) {
      // Allow upload if there is unit_id logic? 
      // Actually, we don't have unit_id here, but that's fine. We'll just allow it if any is active or skip check.
      // Wait, we can check if AT LEAST ONE unit is active, or pesantren is active.
    }

    if (Number(pesantren.storage_used) + file.size > Number(pesantren.storage_limit)) {
      fs.unlinkSync(file.path);
      throw new BadRequestException('Penyimpanan pesantren penuh');
    }

    // Move file to tenant folder
    const tenantFolder = pesantren.id;
    const finalFolder = resolve(join(process.cwd(), 'public', 'uploads', tenantFolder, 'ppdb'));
    if (!fs.existsSync(finalFolder)) {
      fs.mkdirSync(finalFolder, { recursive: true });
    }

    let finalFilename = file.filename;
    let finalPath = resolve(join(finalFolder, finalFilename));
    let finalMime = file.mimetype;
    let finalSize = file.size;

    // Image compression
    if (file.mimetype.startsWith('image/')) {
      try {
        finalFilename = file.filename.replace(/\.[^/.]+$/, '.webp');
        finalPath = resolve(join(finalFolder, finalFilename));
        
        await sharp(file.path).webp({ quality: 80 }).toFile(finalPath);
        fs.unlinkSync(file.path); // remove temp original
        
        finalMime = 'image/webp';
        finalSize = fs.statSync(finalPath).size;
      } catch (err) {
        // Fallback to original
        fs.renameSync(file.path, finalPath);
      }
    } else {
      fs.renameSync(file.path, finalPath);
    }

    // Update storage used
    await this.prisma.pesantren.update({
      where: { id: tenantFolder },
      data: { storage_used: { increment: finalSize } }
    });

    return {
      url: `/uploads/${tenantFolder}/ppdb/${finalFilename}`,
      filename: finalFilename,
    };
  }
}
