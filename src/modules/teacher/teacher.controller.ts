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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create guru/ustad' })
  create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateTeacherDto) {
    return this.svc.create(t, dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'List guru' })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
    @Query('search') s?: string,
  ) {
    return this.svc.findAll(t, p, l, s);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current teacher profile' })
  getProfile(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.getProfile(t, userId);
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.svc.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.remove(t, id);
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
}
