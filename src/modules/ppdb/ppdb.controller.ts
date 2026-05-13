import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PpdbService } from './ppdb.service';
import { CreatePpdbWaveDto, UpdatePpdbWaveDto } from './dto/ppdb-wave.dto';

@ApiTags('ppdb')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('ppdb')
export class PpdbController {
  constructor(private readonly ppdbService: PpdbService) {}

  @Get('status')
  @Roles(Role.ADMIN_PESANTREN, Role.SUPER_ADMIN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Get PPDB status (active/inactive)' })
  async getStatus(@CurrentUser('tenant_uuid') t: string) {
    return this.ppdbService.getPpdbStatus(t);
  }

  @Post('status')
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Toggle PPDB status' })
  async toggleStatus(@CurrentUser('tenant_uuid') t: string, @Body('is_active') isActive: boolean) {
    return this.ppdbService.togglePpdbStatus(t, isActive);
  }

  @Get('waves')
  @Roles(Role.ADMIN_PESANTREN, Role.SUPER_ADMIN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Get all PPDB waves' })
  async findAll(@CurrentUser('tenant_uuid') t: string) {
    return this.ppdbService.findAll(t);
  }

  @Post('waves')
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create a new PPDB wave' })
  async create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreatePpdbWaveDto) {
    return this.ppdbService.create(t, dto);
  }

  @Put('waves/:id')
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update a PPDB wave' })
  async update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdatePpdbWaveDto,
  ) {
    return this.ppdbService.update(id, t, dto);
  }

  @Delete('waves/:id')
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete a PPDB wave' })
  async remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.ppdbService.remove(id, t);
  }
}
