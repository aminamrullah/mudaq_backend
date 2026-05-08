import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Put,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalisantriService } from './walisantri.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('walisantri')
@Controller('walisantri')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class WalisantriController {
  constructor(private readonly svc: WalisantriService) {}

  // ── My Children (Students) ──
  @Get('my-students')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get students linked to this wali' })
  getMyStudents(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
  ) {
    return this.svc.getMyStudents(t, phone);
  }

  @Get('students/:studentId')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student detail for wali' })
  getStudentDetail(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
  ) {
    return this.svc.getStudentDetail(t, phone, studentId);
  }

  // ── Attendance ──
  @Get('students/:studentId/attendance')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student attendance history' })
  getAttendance(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
    @Query('month') month?: string,
  ) {
    return this.svc.getAttendance(t, phone, studentId, month);
  }

  // ── Tahfidz ──
  @Get('students/:studentId/tahfidz')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student tahfidz records' })
  getTahfidz(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
    @Query('category') category?: string,
  ) {
    return this.svc.getTahfidz(t, phone, studentId, category);
  }

  // ── Health ──
  @Get('students/:studentId/health')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student health records' })
  getHealth(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
  ) {
    return this.svc.getHealth(t, phone, studentId);
  }

  // ── Violations ──
  @Get('students/:studentId/violations')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student violations' })
  getViolations(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
  ) {
    return this.svc.getViolations(t, phone, studentId);
  }

  // ── Permissions / Leave Requests ──
  @Get('students/:studentId/permissions')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student leave requests' })
  getPermissions(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
  ) {
    return this.svc.getPermissions(t, phone, studentId);
  }

  @Post('students/:studentId/permissions')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Create leave request' })
  createPermission(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
    @Body() body: { type: string; reason: string; start_date: string; end_date?: string },
  ) {
    return this.svc.createPermission(t, phone, studentId, body);
  }

  // ── Bills ──
  @Get('students/:studentId/bills')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student bills' })
  getBills(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getBills(t, phone, studentId, status);
  }

  // ── Report Cards ──
  @Get('students/:studentId/report-cards')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get student report cards' })
  getReportCards(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('phone') phone: string,
    @Param('studentId') studentId: string,
  ) {
    return this.svc.getReportCards(t, phone, studentId);
  }

  // ── Notifications ──
  @Get('notifications')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get user notifications' })
  getNotifications(
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getNotifications(userId);
  }

  @Put('notifications/:id/read')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Mark notification as read' })
  markNotificationRead(
    @CurrentUser('id') userId: string,
    @Param('id') notifId: string,
  ) {
    return this.svc.markNotificationRead(userId, notifId);
  }

  @Put('notifications/read-all')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.svc.markAllNotificationsRead(userId);
  }

  // ── Announcements ──
  @Get('announcements')
  @Roles(Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Get announcements for this pesantren' })
  getAnnouncements(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getAnnouncements(t);
  }
}
