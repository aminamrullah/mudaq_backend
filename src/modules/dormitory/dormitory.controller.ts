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
import { DormitoryService } from './dormitory.service';
import {
  CreateDormitoryDto,
  UpdateDormitoryDto,
  CreateRoomDto,
  UpdateRoomDto,
} from './dto/dormitory.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('dormitories')
@Controller('dormitories')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class DormitoryController {
  constructor(private readonly svc: DormitoryService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create dormitory' })
  create(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateDormitoryDto,
  ) {
    return this.svc.create(t, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List dormitories' })
  findAll(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.findAll(t);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dormitory detail' })
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOne(t, id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateDormitoryDto,
  ) {
    return this.svc.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.remove(t, id);
  }

  // ── Rooms ──
  @Post(':id/rooms')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create room in dormitory' })
  createRoom(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.svc.createRoom(t, id, dto);
  }

  @Get('rooms/all')
  @ApiOperation({ summary: 'List all rooms across dormitories' })
  findAllRooms(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.findRooms(t);
  }

  @Get(':id/rooms')
  @ApiOperation({ summary: 'List rooms in dormitory' })
  findRooms(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findRooms(t, id);
  }

  @Put('rooms/:roomId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  updateRoom(
    @CurrentUser('tenant_uuid') t: string,
    @Param('roomId') rid: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.svc.updateRoom(t, rid, dto);
  }

  @Delete('rooms/:roomId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  removeRoom(
    @CurrentUser('tenant_uuid') t: string,
    @Param('roomId') rid: string,
  ) {
    return this.svc.removeRoom(t, rid);
  }

  @Get('rooms/:roomId/students')
  @ApiOperation({ summary: 'Get occupants of a room' })
  getOccupants(
    @CurrentUser('tenant_uuid') t: string,
    @Param('roomId') rid: string,
  ) {
    return this.svc.findRoomOccupants(t, rid);
  }

  @Post('rooms/:roomId/assign')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Assign student to a room' })
  assignStudent(
    @CurrentUser('tenant_uuid') t: string,
    @Param('roomId') rid: string,
    @Body('student_id') sid: string,
  ) {
    return this.svc.assignStudentToRoom(t, rid, sid);
  }

  @Post('rooms/unassign/:studentId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Unassign student from any room' })
  unassignStudent(
    @CurrentUser('tenant_uuid') t: string,
    @Param('studentId') sid: string,
  ) {
    return this.svc.unassignStudentFromRoom(t, sid);
  }
}
