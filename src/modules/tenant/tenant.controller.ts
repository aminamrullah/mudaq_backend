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
  Request,
  ForbiddenException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import * as express from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { XenditService } from './xendit.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly xendit: XenditService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new pesantren (Super Admin only)' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all pesantren' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.tenantService.findAll(page || 1, limit || 20, search);
  }

  @Get('invoices')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all SaaS invoices (Super Admin)' })
  async getAllInvoices() {
    return this.tenantService.findAllInvoices();
  }

  @Put('invoices/:id/status')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update SaaS invoice status' })
  async updateInvoiceStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.tenantService.updateInvoiceStatus(id, status);
  }

  @Get('print-saas-invoice/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Print SaaS invoice' })
  async getInvoicePrint(@Param('id') id: string, @Res() res: express.Response) {
    const html = await this.tenantService.getInvoiceHtml(id);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Get('my-invoices')
  @Roles(Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Get SaaS invoices for current pesantren' })
  async getMyInvoices(@Request() req: any) {
    return this.tenantService.findInvoicesByTenant(req.user.tenant_uuid);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Get pesantren detail' })
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update pesantren' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  @Get('settings/me')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get current pesantren settings' })
  async getSettings(@Request() req: any) {
    if (!req.user.tenant_uuid) {
      throw new ForbiddenException(
        'User tidak terasosiasi dengan pesantren manapun',
      );
    }
    return this.tenantService.findOne(req.user.tenant_uuid);
  }

  @Put('settings/me')
  @Roles(Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Update current pesantren settings' })
  async updateSettings(@Request() req: any, @Body() dto: UpdateTenantDto) {
    // Prevent changing critical fields by non-superadmin if needed
    // For now, allow it as it's their own pesantren
    return this.tenantService.update(req.user.tenant_uuid, dto);
  }

  @Post(':id/sync-usage')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Sync usage log for a pesantren' })
  async syncUsage(@Param('id') id: string) {
    return this.tenantService.recordUsage(id);
  }

  @Post(':id/generate-invoice')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate monthly invoice for a pesantren' })
  async generateInvoice(@Param('id') id: string) {
    return this.tenantService.generateInvoice(id);
  }

  @Post('generate-all-invoices')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate monthly invoices for all active pesantren' })
  async generateAllInvoices() {
    return this.tenantService.generateAllInvoices();
  }

  @Post(':id/xendit-account')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Xendit sub-account for existing pesantren' })
  async createXenditAccount(@Param('id') id: string) {
    const tenant = await this.tenantService.findOne(id);
    if (tenant.xendit_sub_account_id) {
      throw new BadRequestException('Pesantren sudah memiliki akun Xendit');
    }

    const subAccountId = await this.xendit.createSubAccount(
      tenant.name,
      tenant.email || 'admin@pesantren.id',
    );
    if (!subAccountId) {
      throw new BadRequestException(
        'Gagal membuat akun Xendit, periksa konfigurasi API',
      );
    }

    return this.tenantService.update(id, {
      xendit_sub_account_id: subAccountId,
    });
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft delete pesantren' })
  remove(@Param('id') id: string) {
    return this.tenantService.remove(id);
  }

  @Get(':id/activities')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Get activity logs for a pesantren' })
  async getActivities(@Param('id') id: string) {
    return this.tenantService.findActivitiesByTenant(id);
  }

  @Get('activities/me')
  @Roles(Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get activity logs for current pesantren' })
  async getMyActivities(@Request() req: any) {
    return this.tenantService.findActivitiesByTenant(req.user.tenant_uuid);
  }
}
