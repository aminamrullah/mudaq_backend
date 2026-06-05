import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { CreatePayrollDto, GeneratePayrollDto } from './dto/payroll.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('payroll')
@Controller('payroll')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Create payroll' })
  create(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreatePayrollDto) {
    return this.svc.create(t, dto);
  }
  @Post('generate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Generate payroll draft from attendance' })
  generateDraft(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: GeneratePayrollDto,
  ) {
    return this.svc.generateDraft(t, dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'List payrolls' })
  findAll(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
  ) {
    return this.svc.findAll(t, p, l);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  findOne(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOne(t, id);
  }

  @Post(':id/approve')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Approve payroll' })
  approve(
    @CurrentUser('tenant_uuid') t: string,
    @CurrentUser('id') uid: string,
    @Param('id') id: string,
  ) {
    return this.svc.approve(t, id, uid);
  }

  @Post(':id/paid')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Mark payroll as paid' })
  markPaid(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.markPaid(t, id);
  }

  @Post('items/:itemId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Update individual payroll item' })
  updateItem(
    @CurrentUser('tenant_uuid') t: string,
    @Param('itemId') itemId: string,
    @Body() dto: { allowances?: number; deductions?: number; notes?: string },
  ) {
    return this.svc.updateItem(t, itemId, dto);
  }

  @Post('items/:itemId/pay')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Pay individual payroll item (cash or wallet)' })
  payItem(
    @CurrentUser('tenant_uuid') t: string,
    @Param('itemId') itemId: string,
    @Body() dto: { paymentMethod: 'cash' | 'wallet' },
  ) {
    return this.svc.payItem(t, itemId, dto);
  }
}
