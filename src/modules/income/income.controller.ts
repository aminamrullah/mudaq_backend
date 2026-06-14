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
import { IncomeService } from './income.service';
import { CreateIncomeDto, UpdateIncomeDto } from './income.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('income')
@Controller('income')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class IncomeController {
  constructor(private readonly svc: IncomeService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Catat pemasukan manual' })
  create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateIncomeDto) {
    return this.svc.create(t, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Daftar pemasukan manual' })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('month') month?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.findAll(t, month, page, limit);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Ringkasan total pemasukan' })
  getSummary(
    @CurrentUser('tenant_uuid') t: string,
    @Query('month') month?: string,
  ) {
    return this.svc.getSummary(t, month);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail pemasukan' })
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOne(t, id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Update pemasukan' })
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
  ) {
    return this.svc.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Hapus pemasukan' })
  remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.remove(t, id);
  }
}
