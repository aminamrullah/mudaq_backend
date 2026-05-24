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
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  CreateFeeCategoryDto,
  UpdateFeeCategoryDto,
  GenerateBillsDto,
  RecordPaymentDto,
  RecordDonationDto,
  RecordDisbursementDto,
  PayBulkDto,
} from './dto/billing.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('billing')
@Controller('billing')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Post('fee-categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Create fee category' })
  createFee(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateFeeCategoryDto,
  ) {
    return this.svc.createFeeCategory(t, dto);
  }

  @Get('fee-categories')
  @ApiOperation({ summary: 'List fee categories' })
  getFees(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getFeeCategories(t);
  }

  @Put('fee-categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  updateFee(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateFeeCategoryDto,
  ) {
    return this.svc.updateFeeCategory(t, id, dto);
  }

  @Delete('fee-categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  deleteFee(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.deleteFeeCategory(t, id);
  }

  @Post('generate')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Generate bills for students' })
  generate(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: GenerateBillsDto,
  ) {
    return this.svc.generateBills(t, dto);
  }

  @Get('bills')
  @ApiOperation({ summary: 'List bills' })
  getBills(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
    @Query('status') s?: string,
    @Query('student_id') sid?: string,
    @Query('student_status') sst?: string,
  ) {
    return this.svc.getBills(t, p, l, s, sid, sst);
  }

  @Post('pay')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.FINANCE_PESANTREN,
    Role.WALI_SANTRI,
  )
  @ApiOperation({ summary: 'Record payment' })
  pay(@CurrentUser('tenant_uuid') t: string, @Body() dto: RecordPaymentDto) {
    return this.svc.recordPayment(t, dto);
  }

  @Post('pay-all')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Record bulk payment for all student bills' })
  payAll(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { student_id: string; payment_method: string; pin?: string },
  ) {
    return this.svc.payAllBills(t, dto);
  }

  @Post('pay-bulk')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Record bulk payment for selected bills' })
  payBulk(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: PayBulkDto,
  ) {
    return this.svc.payBulkBills(t, dto);
  }

  @Post('donate')
  @Roles(
    Role.SUPER_ADMIN,
    Role.ADMIN_PESANTREN,
    Role.FINANCE_PESANTREN,
    Role.WALI_SANTRI,
  )
  @ApiOperation({ summary: 'Record donation' })
  donate(@CurrentUser('tenant_uuid') t: string, @Body() dto: RecordDonationDto) {
    return this.svc.recordDonation(t, dto);
  }

  @Get('transactions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'List transactions' })
  getTransactions(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
    @Query('type') type?: string,
  ) {
    return this.svc.getTransactions(t, p, l, type);
  }

  @Post('disbursements')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Record donation disbursement' })
  recordDisbursement(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: RecordDisbursementDto,
  ) {
    return this.svc.recordDisbursement(t, dto);
  }

  @Get('disbursements')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'List donation disbursements' })
  getDisbursements(
    @CurrentUser('tenant_uuid') t: string,
    @Query('page') p?: number,
    @Query('limit') l?: number,
  ) {
    return this.svc.getDisbursements(t, p, l);
  }

  @Get('donation-summary')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Get donation financial summary' })
  getDonationSummary(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.getDonationSummary(t);
  }
 
  @Post('notify-bills')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN)
  @ApiOperation({ summary: 'Send WhatsApp notification for bills' })
  notifyBills(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: { bill_ids: string[] },
  ) {
    return this.svc.notifyBills(t, dto.bill_ids);
  }

  @Get('bills/:id/receipt')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Print bill receipt' })
  async getBillReceiptHtml(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const html = await this.svc.getBillReceiptHtml(t, id);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Get('transactions/:id/receipt')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.WALI_SANTRI)
  @ApiOperation({ summary: 'Print transaction receipt' })
  async getReceiptHtml(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const html = await this.svc.getTransactionReceiptHtml(t, id);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }
}
