import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TahfidzService } from './tahfidz.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CreateTahfidzRecordDto, UpdateTahfidzRecordDto } from './dto/tahfidz.dto';

@ApiTags('tahfidz')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@Controller('tahfidz')
export class TahfidzController {
  constructor(private readonly tahfidzService: TahfidzService) { }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN, Role.USTAD, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Get tahfidz records' })
  getRecords(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: any
  ) {
    return this.tahfidzService.getRecords(t, query, userId, role);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Create tahfidz record' })
  createRecord(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateTahfidzRecordDto
  ) {
    return this.tahfidzService.createRecord(t, dto, userId, role);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Update tahfidz record' })
  updateRecord(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
    @Body() dto: UpdateTahfidzRecordDto
  ) {
    return this.tahfidzService.updateRecord(t, id, dto, userId, role);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.USTAD, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Delete tahfidz record' })
  deleteRecord(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string
  ) {
    return this.tahfidzService.deleteRecord(t, id, userId, role);
  }
}
