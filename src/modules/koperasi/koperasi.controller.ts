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
import { KoperasiService } from './koperasi.service';
import {
  CreateOutletDto, UpdateOutletDto,
  CreateCategoryDto, UpdateCategoryDto,
  CreateUnitDto, UpdateUnitDto,
  CreateProductDto, UpdateProductDto,
  StockInDto, CreateOpnameDto, CompleteOpnameDto,
  CreatePromotionDto,
  OpenSessionDto, CloseSessionDto, CheckoutDto, UpdateOrderStatusDto,
} from './dto/koperasi.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('koperasi')
@Controller('koperasi')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class KoperasiController {
  constructor(private readonly svc: KoperasiService) {}

  @Get('stats') 
  @ApiOperation({ summary: 'Get dashboard stats' })
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.KEPALA_KOPERASI)
  getStats(@CurrentUser('tenant_uuid') t: string, @Query('outlet_id') o?: string) {
    return this.svc.getDashboardStats(t, o);
  }

  // ─── OUTLETS ─────────────────────────────────────────────────
  @Get('outlets')
  @ApiOperation({ summary: 'List outlets' })
  // all roles including staf koperasi can fetch outlets to know where they are
  getOutlets(@CurrentUser('tenant_uuid') t: string) { return this.svc.getOutlets(t); }

  @Post('outlets')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  createOutlet(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateOutletDto) { return this.svc.createOutlet(t, dto); }

  @Put('outlets/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN)
  updateOutlet(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() dto: UpdateOutletDto) { return this.svc.updateOutlet(t, id, dto); }

  // ─── CATEGORIES ──────────────────────────────────────────────
  @Get('categories')
  getCategories(
    @CurrentUser('tenant_uuid') t: string,
    @Query('outlet_id') o?: string,
  ) { return this.svc.getCategories(t, o); }

  @Post('categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  createCategory(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateCategoryDto) { return this.svc.createCategory(t, dto); }

  @Put('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  updateCategory(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.svc.updateCategory(t, id, dto); }

  @Delete('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  deleteCategory(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) { return this.svc.deleteCategory(t, id); }

  // ─── UNITS ───────────────────────────────────────────────────
  @Get('units')
  getUnits(
    @CurrentUser('tenant_uuid') t: string,
    @Query('outlet_id') o?: string,
  ) { return this.svc.getUnits(t, o); }

  @Post('units')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  createUnit(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreateUnitDto) { return this.svc.createUnit(t, dto); }

  @Put('units/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  updateUnit(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() dto: UpdateUnitDto) { return this.svc.updateUnit(t, id, dto); }

  @Delete('units/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  deleteUnit(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) { return this.svc.deleteUnit(t, id); }

  // ─── PRODUCTS ────────────────────────────────────────────────
  @Get('products')
  getProducts(
    @CurrentUser('tenant_uuid') t: string,
    @Query('search') search?: string,
    @Query('outlet_id') outlet_id?: string,
    @Query('category_id') category_id?: string,
    @Query('is_active') is_active?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) { return this.svc.getProducts(t, { search, outlet_id, category_id, is_active, page, limit }); }

  @Post('products')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  createProduct(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: CreateProductDto) { return this.svc.createProduct(t, u, dto); }

  @Put('products/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  updateProduct(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.svc.updateProduct(t, id, dto); }

  @Delete('products/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  deleteProduct(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) { return this.svc.deleteProduct(t, id); }

  // ─── STOCK & OPNAME ──────────────────────────────────────────
  @Post('stock-in')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  stockIn(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: StockInDto) { return this.svc.stockIn(t, u, dto); }

  @Post('opname')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  createOpname(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: CreateOpnameDto) { return this.svc.createStockOpname(t, u, dto); }

  @Get('opname/draft/:outlet_id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  getOpnameDraft(@CurrentUser('tenant_uuid') t: string, @Param('outlet_id') o: string) { return this.svc.getOpnameDraft(t, o); }

  @Delete('opname/draft/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  cancelOpnameDraft(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) { return this.svc.cancelOpnameDraft(t, id); }

  @Post('opname/complete')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  completeOpname(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: CompleteOpnameDto) { return this.svc.completeStockOpname(t, u, dto); }

  @Get('stock-movements')
  getStockMovements(
    @CurrentUser('tenant_uuid') t: string, 
    @Query('outlet_id') o?: string, 
    @Query('product_id') p?: string, 
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('page') pg?: number, 
    @Query('limit') l?: number
  ) {
    return this.svc.getStockMovements(t, { 
      outlet_id: o, 
      product_id: p, 
      type,
      search,
      date_from,
      date_to,
      page: pg, 
      limit: l 
    });
  }

  @Post('stock-adjust')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  adjustStock(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: { product_id: string; outlet_id: string; quantity: number; type: string; notes?: string }) {
    return this.svc.adjustStock(t, u, dto);
  }

  // ─── PROMOTIONS ──────────────────────────────────────────────
  @Get('promotions')
  getPromotions(@CurrentUser('tenant_uuid') t: string, @Query('outlet_id') o: string) { return this.svc.getPromotions(t, o); }

  @Post('promotions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI)
  createPromotion(@CurrentUser('tenant_uuid') t: string, @Body() dto: CreatePromotionDto) { return this.svc.createPromotion(t, dto); }

  // ─── POS SESSION & ORDERS ────────────────────────────────────
  @Get('pos/session')
  // All roles (including STAF_KOPERASI) can access session info and checkout
  getActiveSession(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string) { return this.svc.getActiveSession(t, u); }

  @Post('pos/open-session')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  openSession(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: OpenSessionDto) { return this.svc.openSession(t, u, dto); }

  @Post('pos/close-session')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  closeSession(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: CloseSessionDto) { return this.svc.closeSession(t, u, dto); }

  @Post('pos/rfid-lookup')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  @ApiOperation({ summary: 'Lookup student by RFID card for POS transaction' })
  rfidLookup(
    @CurrentUser('tenant_uuid') t: string,
    @Body('rfid') rfid: string,
  ) {
    return this.svc.lookupByRfid(t, rfid);
  }

  @Post('pos/checkout')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  checkout(@CurrentUser('tenant_uuid') t: string, @CurrentUser('id') u: string, @Body() dto: CheckoutDto) { return this.svc.checkout(t, u, dto); }

  @Get('orders')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.FINANCE_PESANTREN, Role.KEPALA_KOPERASI)
  getOrders(
    @CurrentUser('tenant_uuid') t: string, 
    @Query('outlet_id') o?: string, 
    @Query('type') type?: string, 
    @Query('search') search?: string,
    @Query('date_from') df?: string, 
    @Query('date_to') dt?: string, 
    @Query('page') pg?: number, 
    @Query('limit') l?: number
  ) {
    return this.svc.getOrders(t, { 
      outlet_id: o, 
      type, 
      search,
      date_from: df, 
      date_to: dt, 
      page: pg, 
      limit: l 
    });
  }

  @Put('orders/:id/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.KEPALA_KOPERASI, Role.STAF_KOPERASI)
  @ApiOperation({ summary: 'Update order status (for mobile orders)' })
  updateOrderStatus(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto
  ) {
    return this.svc.updateOrderStatus(t, id, dto);
  }
}
