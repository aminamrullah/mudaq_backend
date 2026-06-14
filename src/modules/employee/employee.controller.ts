import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeeService } from './employee.service';
import {
  CreateWorkScheduleDto,
  UpdateWorkScheduleDto,
  EmployeeCheckInDto,
  EmployeeCheckOutDto,
  EmployeePermissionDto,
  TeachingPermissionDto,
  OvertimeRequestDto,
  ApprovalDto,
} from './dto/employee.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('employee')
@Controller('employee')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class EmployeeController {
  constructor(private readonly svc: EmployeeService) {}

  // ---------------- WORK SCHEDULES ----------------
  @Post('schedules')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Create Employee Work Schedule' })
  createSchedule(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateWorkScheduleDto,
  ) {
    return this.svc.createSchedule(t, dto);
  }

  @Get('schedules')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Get all Work Schedules' })
  getSchedules(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getSchedules(t);
  }

  @Patch('schedules/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update Employee Work Schedule' })
  updateSchedule(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkScheduleDto,
  ) {
    return this.svc.updateSchedule(t, id, dto);
  }

  // ---------------- ATTENDANCE ----------------
  @Post('attendance/check-in')
  @ApiOperation({ summary: 'Check in for work' })
  checkIn(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EmployeeCheckInDto,
  ) {
    return this.svc.checkIn(t, userId, dto);
  }

  @Post('attendance/check-out')
  @ApiOperation({ summary: 'Check out from work' })
  checkOut(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EmployeeCheckOutDto,
  ) {
    return this.svc.checkOut(t, userId, dto);
  }

  @Get('attendance/history')
  @ApiOperation({ summary: 'Get own work attendance history' })
  getAttendanceHistory(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Query('month') month?: string,
  ) {
    return this.svc.getAttendanceHistory(t, userId, month);
  }

  @Get('attendance/admin')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Get all employee attendance for admin' })
  getAllAttendance(
    @CurrentUser('tenant_uuid') t: string,
    @Query('date') date?: string,
  ) {
    return this.svc.getAllAttendance(t, date);
  }

  // ---------------- OVERTIME ----------------
  @Post('overtime')
  @ApiOperation({ summary: 'Request overtime' })
  requestOvertime(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: OvertimeRequestDto,
  ) {
    return this.svc.requestOvertime(t, userId, dto);
  }

  @Patch('overtime/:id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Approve or reject overtime' })
  approveOvertime(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.svc.approveOvertime(t, adminId, id, dto);
  }

  // ---------------- PERMISSIONS ----------------
  @Post('permissions')
  @ApiOperation({ summary: 'Request employee permission (cuti/sakit/izin)' })
  requestPermission(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EmployeePermissionDto,
  ) {
    return this.svc.requestPermission(t, userId, dto);
  }

  @Post('teaching-permissions')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Request teaching permission' })
  requestTeachingPermission(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TeachingPermissionDto,
  ) {
    return this.svc.requestTeachingPermission(t, userId, dto);
  }

  @Get('permissions/admin')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Get all permission requests' })
  getAllPermissions(
    @CurrentUser('tenant_uuid') t: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getAllPermissions(t, status);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get own employee permission requests' })
  getOwnPermissions(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getOwnPermissions(t, userId);
  }

  @Get('teaching-permissions')
  @Roles(Role.USTAD)
  @ApiOperation({ summary: 'Get own teaching permissions' })
  getOwnTeachingPermissions(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getOwnTeachingPermissions(t, userId);
  }

  @Patch('permissions/:id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Approve or reject employee permission' })
  approvePermission(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.svc.approvePermission(t, adminId, id, dto);
  }

  @Patch('teaching-permissions/:id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Approve or reject teaching permission' })
  approveTeachingPermission(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ApprovalDto,
  ) {
    return this.svc.approveTeachingPermission(t, adminId, id, dto);
  }
}
