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
import { ShalatAttendanceService } from './shalat-attendance.service';
import { CreateShalatAttendanceDto } from './dto/create-shalat-attendance.dto';
import { ScanRfidDto } from './dto/scan-rfid.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('shalat-attendance')
@Controller('shalat-attendance')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class ShalatAttendanceController {
  constructor(private readonly svc: ShalatAttendanceService) {}

  @Post('bulk')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Bulk create/update shalat attendance' })
  bulkCreate(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateShalatAttendanceDto,
  ) {
    return this.svc.bulkCreate(t, dto);
  }

  @Post('scan')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Scan RFID for shalat attendance' })
  scanRfid(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: ScanRfidDto,
  ) {
    return this.svc.scanRfid(t, dto);
  }

  @Get('options')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Get shalat options' })
  getOptions(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getOptions(t);
  }

  @Post('options')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Update shalat options' })
  updateOptions(
    @CurrentUser('tenant_uuid') t: string,
    @Body() body: { options: string[] },
  ) {
    return this.svc.updateOptions(t, body.options);
  }

  @Get('by-date')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Get shalat attendance by date and shalat name' })
  findByDateAndShalat(
    @CurrentUser('tenant_uuid') t: string,
    @Query('date') date: string,
    @Query('shalat_name') shalat_name?: string,
    @Query('classroom_id') classroom_id?: string,
  ) {
    return this.svc.findByDateAndShalat(t, date, shalat_name, classroom_id);
  }

  @Get('student/:studentId')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
    Role.WALI_SANTRI, // Important for parents to view
  )
  @ApiOperation({ summary: 'Get student shalat attendance history' })
  getStudentHistory(
    @CurrentUser('tenant_uuid') t: string,
    @Param('studentId') sid: string,
    @Query('month') m?: string,
  ) {
    return this.svc.getStudentHistory(t, sid, m);
  }

  @Get('summary')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.USTAD,
    Role.STAFF_PESANTREN,
  )
  @ApiOperation({ summary: 'Get shalat attendance summary' })
  getSummary(
    @CurrentUser('tenant_uuid') t: string,
    @Query('date') date: string,
  ) {
    return this.svc.getSummary(t, date);
  }
}
