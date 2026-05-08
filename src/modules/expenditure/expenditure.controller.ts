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
import { ExpenditureService } from './expenditure.service';
import { CreateExpenditureDto, UpdateExpenditureDto } from './expenditure.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('expenditure')
@Controller('expenditure')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class ExpenditureController {
  constructor(private readonly svc: ExpenditureService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Create expenditure' })
  create(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateExpenditureDto,
  ) {
    return this.svc.create(t, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List expenditures' })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('month') month?: string,
  ) {
    return this.svc.findAll(t, month);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expenditure detail' })
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOne(t, id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Update expenditure' })
  update(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenditureDto,
  ) {
    return this.svc.update(t, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Delete expenditure' })
  remove(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.remove(t, id);
  }
}
