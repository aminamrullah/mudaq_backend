import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { EducationUnitService } from './education-unit.service';
import { CreateEducationUnitDto, UpdateEducationUnitDto } from './dto/education-unit.dto';
import { AuthGuard } from '@nestjs/passport';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('education-units')
@UseGuards(AuthGuard('jwt'), TenantGuard, RolesGuard)
export class EducationUnitController {
  constructor(private readonly educationUnitService: EducationUnitService) {}

  @Post()
  @Roles('ADMIN_PESANTREN', 'SUPER_ADMIN')
  create(@Body() dto: CreateEducationUnitDto, @CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.educationUnitService.create(tenantUuid, dto);
  }

  @Get()
  @Roles('ADMIN_PESANTREN', 'SUPER_ADMIN', 'ADMIN_UNIT', 'STAFF_PESANTREN')
  findAll(@CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.educationUnitService.findAll(tenantUuid);
  }

  @Get(':id')
  @Roles('ADMIN_PESANTREN', 'SUPER_ADMIN', 'ADMIN_UNIT')
  findOne(@Param('id') id: string, @CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.educationUnitService.findOne(tenantUuid, id);
  }

  @Patch(':id')
  @Roles('ADMIN_PESANTREN', 'SUPER_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEducationUnitDto,
    @CurrentUser('tenant_uuid') tenantUuid: string,
  ) {
    return this.educationUnitService.update(tenantUuid, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN_PESANTREN', 'SUPER_ADMIN')
  remove(@Param('id') id: string, @CurrentUser('tenant_uuid') tenantUuid: string) {
    return this.educationUnitService.remove(tenantUuid, id);
  }
}
