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
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, BulkAttendanceDto } from './dto/attendance.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Post()
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Create single attendance' })
  create(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateAttendanceDto,
  ) {
    return this.svc.create(t, dto);
  }

  @Post('bulk')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Bulk create attendance' })
  bulkCreate(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: BulkAttendanceDto,
  ) {
    return this.svc.bulkCreate(t, dto);
  }

  @Get('by-date')
  @ApiOperation({ summary: 'Get attendance by date' })
  findByDate(
    @CurrentUser('tenant_uuid') t: string,
    @Query('date') date: string,
    @Query('classroom_id') cid?: string,
    @Query('schedule_id') sid?: string,
  ) {
    return this.svc.findByDate(t, date, cid, sid);
  }

  @Get('student/:studentId')
  @ApiOperation({ summary: 'Get student attendance history' })
  getStudentAttendance(
    @CurrentUser('tenant_uuid') t: string,
    @Param('studentId') sid: string,
    @Query('month') m?: string,
  ) {
    return this.svc.getStudentAttendance(t, sid, m);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get attendance summary by month' })
  getSummary(
    @CurrentUser('tenant_uuid') t: string,
    @Query('month') month: string,
  ) {
    return this.svc.getSummary(t, month);
  }
}
