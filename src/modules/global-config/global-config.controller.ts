import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GlobalConfigService } from './global-config.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('global-config')
@Controller('global-config')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class GlobalConfigController {
  constructor(private readonly svc: GlobalConfigService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all global configurations' })
  getAll() {
    return this.svc.getAll();
  }

  @Put()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update global configurations' })
  update(@Body() configs: Record<string, string>) {
    return this.svc.updateBulk(configs);
  }
}
