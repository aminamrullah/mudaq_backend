import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { CreateTeacherAttendanceDto, BulkTeacherAttendanceDto, TeacherCheckInDto, TeacherLeaveDto } from './dto/teacher-attendance.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('teacher-attendance')
@Controller('teacher-attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class TeacherAttendanceController {
  constructor(private readonly svc: TeacherAttendanceService) {}

  @Post('register-face')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Register face descriptor for teacher' })
  async registerFace(
    @CurrentUser('id') userId: string,
    @Body() dto: { image_base64: string }
  ) {
    if (!dto.image_base64) throw new BadRequestException('Gambar wajah tidak boleh kosong');
    return this.svc.registerFace(userId, dto.image_base64);
  }

  @Post('check-in')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Face validation check in for teacher' })
  checkIn(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TeacherCheckInDto,
  ) {
    return this.svc.checkIn(t, userId, dto.schedule_id, dto.date, dto.timestamp, dto.image_base64, dto.latitude, dto.longitude);
  }

  @Post('leave')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Submit leave/izin for an upcoming schedule' })
  requestLeave(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TeacherLeaveDto,
  ) {
    return this.svc.requestLeave(t, userId, dto);
  }

  @Get('status')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Check if teacher has checked in for a schedule' })
  checkStatus(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Query('schedule_id') schedule_id: string,
    @Query('date') date: string,
  ) {
    if (!schedule_id || !date) throw new BadRequestException('schedule_id and date are required');
    return this.svc.checkStatus(t, userId, schedule_id, date);
  }

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
    Role.USTAD,
  )
  @ApiOperation({ summary: 'Create or update single teacher attendance' })
  create(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateTeacherAttendanceDto,
  ) {
    return this.svc.create(t, dto);
  }

  @Post('bulk')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Bulk create teacher attendance' })
  bulkCreate(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: BulkTeacherAttendanceDto,
  ) {
    return this.svc.bulkCreate(t, dto);
  }

  @Get('by-date')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Get teacher attendance by date' })
  findByDate(
    @CurrentUser('tenant_uuid') t: string,
    @Query('date') date: string,
  ) {
    return this.svc.findByDate(t, date);
  }

  @Get('teacher/:teacherId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.STAFF_PESANTREN,
    Role.USTAD,
  )
  @ApiOperation({ summary: 'Get teacher attendance history' })
  getTeacherAttendance(
    @CurrentUser('tenant_uuid') t: string,
    @Param('teacherId') tid: string,
    @Query('month') m?: string,
  ) {
    return this.svc.getTeacherAttendance(t, tid, m);
  }
}
