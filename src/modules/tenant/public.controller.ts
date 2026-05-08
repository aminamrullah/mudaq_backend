import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from '../student/dto/student.dto';

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
      },
    });

    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');
    return pesantren;
  }

  @Post('pesantren/:slug/register')
  @ApiOperation({ summary: 'Register new student to a pesantren by slug (PPDB)' })
  async registerStudent(
    @Param('slug') slug: string,
    @Body() dto: CreateStudentDto,
  ) {
    const pesantren = await this.prisma.pesantren.findUnique({
      where: { slug },
      select: { id: true, max_students: true },
    });

    if (!pesantren) throw new NotFoundException('Pesantren tidak ditemukan');

    // Cek batas kapasitas
    const currentStudents = await this.prisma.student.count({
      where: { tenant_uuid: pesantren.id, status: 'aktif' },
    });

    if (currentStudents >= pesantren.max_students) {
      throw new BadRequestException('Kapasitas pesantren sudah penuh');
    }

    // Set status pendaftar baru
    const studentData: any = {
      ...dto,
      status: 'CALON', // Status khusus untuk yang baru daftar
      tenant_uuid: pesantren.id,
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
