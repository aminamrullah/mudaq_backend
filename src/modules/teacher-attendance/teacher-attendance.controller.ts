import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { CreateTeacherAttendanceDto, BulkTeacherAttendanceDto } from './dto/teacher-attendance.dto';
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
