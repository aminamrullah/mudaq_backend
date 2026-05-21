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
import { InventoryService } from './inventory.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
  CreateInventoryLocationDto,
  UpdateInventoryLocationDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  CreateInventoryMutationDto,
} from './inventory.dto';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  // ═══════════════════════════════════════════════════════════════
  //  CATEGORIES
  // ═══════════════════════════════════════════════════════════════

  @Post('categories')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create inventory category' })
  createCategory(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateInventoryCategoryDto,
  ) {
    return this.svc.createCategory(t, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all inventory categories' })
  findAllCategories(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.findAllCategories(t);
  }

  @Put('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update inventory category' })
  updateCategory(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.svc.updateCategory(t, id, dto);
  }

  @Delete('categories/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete inventory category' })
  deleteCategory(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.svc.deleteCategory(t, id);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOCATIONS
  // ═══════════════════════════════════════════════════════════════

  @Post('locations')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create inventory location' })
  createLocation(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateInventoryLocationDto,
  ) {
    return this.svc.createLocation(t, dto);
  }

  @Get('locations')
  @ApiOperation({ summary: 'Get all inventory locations' })
  findAllLocations(@CurrentUser('tenant_uuid') t: string) {
    return this.svc.findAllLocations(t);
  }

  @Put('locations/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update inventory location' })
  updateLocation(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryLocationDto,
  ) {
    return this.svc.updateLocation(t, id, dto);
  }

  @Delete('locations/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete inventory location' })
  deleteLocation(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
  ) {
    return this.svc.deleteLocation(t, id);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ITEMS
  // ═══════════════════════════════════════════════════════════════

  @Post('items')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create inventory item' })
  createItem(
    @CurrentUser('tenant_uuid') t: string,
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser('id') u: string,
  ) {
    return this.svc.createItem(t, dto, u);
  }

  @Get('items')
  @ApiOperation({ summary: 'Get all inventory items' })
  findAllItems(
    @CurrentUser('tenant_uuid') t: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('locationId') locationId?: string,
    @Query('condition') condition?: string,
  ) {
    return this.svc.findAllItems(t, { search, categoryId, locationId, condition });
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get inventory item details' })
  findOneItem(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.findOneItem(t, id);
  }

  @Put('items/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update inventory item' })
  updateItem(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser('id') u: string,
  ) {
    return this.svc.updateItem(t, id, dto, u);
  }

  @Delete('items/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Delete inventory item' })
  deleteItem(@CurrentUser('tenant_uuid') t: string, @Param('id') id: string) {
    return this.svc.deleteItem(t, id);
  }

  @Post('items/:id/mutation')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Record manual mutation for inventory item' })
  recordMutation(
    @CurrentUser('tenant_uuid') t: string,
    @Param('id') id: string,
    @Body() dto: CreateInventoryMutationDto,
    @CurrentUser('id') u: string,
  ) {
    return this.svc.recordMutation(t, id, dto, u);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MUTATIONS & REPORT
  // ═══════════════════════════════════════════════════════════════

  @Get('mutations')
  @ApiOperation({ summary: 'Get all inventory mutations' })
  findMutations(
    @CurrentUser('tenant_uuid') t: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.svc.findMutations(t, itemId);
  }
}
