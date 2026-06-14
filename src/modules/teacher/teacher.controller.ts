import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeacherService } from './teacher.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('teachers')
@Controller('teachers')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class TeacherController {
  constructor(private readonly svc: TeacherService) { }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Create guru/ustad' })
  create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateTeacherDto) {
    return this.svc.create(t, dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'List guru' })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
    @Query('search') s?: string,
    @Query('unit_id') unitId?: string,
  ) {
    return this.svc.findAll(t, p, l, s, unitId);
  }

  @Get('search-global')
  @Roles(Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Search teachers across all units in tenant' })
  searchGlobal(
    @CurrentUser('tenant_uuid') t: string,
    @Query('search') s: string,
  ) {
    return this.svc.searchGlobal(t, s);
  }

  @Post(':id/assign-unit')
  @Roles(Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  @ApiOperation({ summary: 'Assign a teacher to a unit' })
  assignUnit(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.svc.assignUnit(t, id);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current teacher profile' })
  getProfile(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getProfile(t, userId);
  }

  @Get('profile/admin-phone')
  @ApiOperation({ summary: 'Get pesantren admin phone number' })
  async getAdminPhone(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getAdminPhone(t);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update current teacher profile' })
  async updateProfile(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    const teacher = await this.svc.getProfile(t, userId);
    return this.svc.update(t, teacher.id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOne(t, id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN, Role.ADMIN_UNIT)
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.svc.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.ADMIN_UNIT)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Put(':id/students')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Bulk assign students to teacher' })
  assignStudents(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.svc.assignStudents(t, id, dto);
  }

  @Put(':id/reset-face')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Reset teacher face registration' })
  resetFace(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.svc.resetFace(t, id);
  }
}
