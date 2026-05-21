import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
  CreateInventoryLocationDto,
  UpdateInventoryLocationDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  CreateInventoryMutationDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════
  //  CATEGORIES
  // ═══════════════════════════════════════════════════════════════

  async createCategory(tenantUuid: string, dto: CreateInventoryCategoryDto) {
    const existing = await this.prisma.inventoryCategory.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new BadRequestException('Kategori dengan nama tersebut sudah ada');
    }

    return this.prisma.inventoryCategory.create({
      data: {
        tenant_uuid: tenantUuid,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllCategories(tenantUuid: string) {
    return this.prisma.inventoryCategory.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { name: 'asc' },
    });
  }

  async updateCategory(tenantUuid: string, id: string, dto: UpdateInventoryCategoryDto) {
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });

    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }

    if (dto.name) {
      const existing = await this.prisma.inventoryCategory.findFirst({
        where: {
          tenant_uuid: tenantUuid,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException('Kategori dengan nama tersebut sudah ada');
      }
    }

    return this.prisma.inventoryCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async deleteCategory(tenantUuid: string, id: string) {
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });

    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }

    return this.prisma.inventoryCategory.delete({
      where: { id },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOCATIONS
  // ═══════════════════════════════════════════════════════════════

  async createLocation(tenantUuid: string, dto: CreateInventoryLocationDto) {
    const existing = await this.prisma.inventoryLocation.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new BadRequestException('Lokasi dengan nama tersebut sudah ada');
    }

    return this.prisma.inventoryLocation.create({
      data: {
        tenant_uuid: tenantUuid,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllLocations(tenantUuid: string) {
    return this.prisma.inventoryLocation.findMany({
      where: { tenant_uuid: tenantUuid },
      orderBy: { name: 'asc' },
    });
  }

  async updateLocation(tenantUuid: string, id: string, dto: UpdateInventoryLocationDto) {
    const location = await this.prisma.inventoryLocation.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });

    if (!location) {
      throw new NotFoundException('Lokasi tidak ditemukan');
    }

    if (dto.name) {
      const existing = await this.prisma.inventoryLocation.findFirst({
        where: {
          tenant_uuid: tenantUuid,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException('Lokasi dengan nama tersebut sudah ada');
      }
    }

    return this.prisma.inventoryLocation.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async deleteLocation(tenantUuid: string, id: string) {
    const location = await this.prisma.inventoryLocation.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });

    if (!location) {
      throw new NotFoundException('Lokasi tidak ditemukan');
    }

    return this.prisma.inventoryLocation.delete({
      where: { id },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  ITEMS
  // ═══════════════════════════════════════════════════════════════

  async createItem(tenantUuid: string, dto: CreateInventoryItemDto, userId: string) {
    if (dto.code) {
      const existing = await this.prisma.inventoryItem.findFirst({
        where: { tenant_uuid: tenantUuid, code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(`Barang dengan kode '${dto.code}' sudah terdaftar`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the item
      const item = await tx.inventoryItem.create({
        data: {
          tenant_uuid: tenantUuid,
          name: dto.name,
          code: dto.code || null,
          category_id: dto.category_id || null,
          location_id: dto.location_id || null,
          description: dto.description,
          quantity: dto.quantity,
          condition: dto.condition || 'baik',
          purchase_date: dto.purchase_date ? new Date(dto.purchase_date) : null,
          purchase_price: dto.purchase_price ? new Prisma.Decimal(dto.purchase_price) : null,
          source_of_funds: dto.source_of_funds,
        },
        include: {
          category: true,
          location: true,
        },
      });

      // 2. Record mutation
      await tx.inventoryMutation.create({
        data: {
          tenant_uuid: tenantUuid,
          item_id: item.id,
          type: 'in',
          quantity: dto.quantity,
          description: 'Pendaftaran barang baru',
          created_by: userId,
        },
      });

      return item;
    });
  }

  async findAllItems(
    tenantUuid: string,
    filters: { search?: string; categoryId?: string; locationId?: string; condition?: string },
  ) {
    const where: Prisma.InventoryItemWhereInput = {
      tenant_uuid: tenantUuid,
    };

    if (filters.categoryId) {
      where.category_id = filters.categoryId;
    }

    if (filters.locationId) {
      where.location_id = filters.locationId;
    }

    if (filters.condition) {
      where.condition = filters.condition;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.inventoryItem.findMany({
      where,
      include: {
        category: true,
        location: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOneItem(tenantUuid: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        category: true,
        location: true,
        mutations: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return item;
  }

  async updateItem(tenantUuid: string, id: string, dto: UpdateInventoryItemDto, userId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenant_uuid: tenantUuid },
      include: {
        location: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    if (dto.code && dto.code !== item.code) {
      const existing = await this.prisma.inventoryItem.findFirst({
        where: { tenant_uuid: tenantUuid, code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`Barang dengan kode '${dto.code}' sudah terdaftar`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const mutationsToCreate: Prisma.InventoryMutationCreateManyInput[] = [];

      // A. Check for Location change
      if (dto.location_id !== undefined && dto.location_id !== item.location_id) {
        let fromLocName = item.location?.name || 'Tidak diketahui';
        let toLocName = 'Tidak diketahui';

        if (dto.location_id) {
          const newLoc = await tx.inventoryLocation.findFirst({ where: { id: dto.location_id } });
          if (newLoc) toLocName = newLoc.name;
        } else {
          toLocName = 'Dikeluarkan dari lokasi';
        }

        mutationsToCreate.push({
          tenant_uuid: tenantUuid,
          item_id: id,
          type: 'move',
          quantity: item.quantity,
          from_location: fromLocName,
          to_location: toLocName,
          description: `Perubahan lokasi barang`,
          created_by: userId,
        });
      }

      // B. Check for Condition change
      if (dto.condition !== undefined && dto.condition !== item.condition) {
        mutationsToCreate.push({
          tenant_uuid: tenantUuid,
          item_id: id,
          type: 'condition_change',
          quantity: item.quantity,
          description: `Kondisi berubah dari '${item.condition}' menjadi '${dto.condition}'`,
          created_by: userId,
        });
      }

      // C. Check for Quantity change
      if (dto.quantity !== undefined && dto.quantity !== item.quantity) {
        const diff = dto.quantity - item.quantity;
        mutationsToCreate.push({
          tenant_uuid: tenantUuid,
          item_id: id,
          type: diff > 0 ? 'in' : 'out',
          quantity: Math.abs(diff),
          description: `Penyesuaian kuantitas secara manual (Stok: ${item.quantity} -> ${dto.quantity})`,
          created_by: userId,
        });
      }

      // Perform update
      const updatedItem = await tx.inventoryItem.update({
        where: { id },
        data: {
          name: dto.name,
          code: dto.code !== undefined ? dto.code || null : undefined,
          category_id: dto.category_id !== undefined ? dto.category_id || null : undefined,
          location_id: dto.location_id !== undefined ? dto.location_id || null : undefined,
          description: dto.description,
          quantity: dto.quantity,
          condition: dto.condition,
          purchase_date: dto.purchase_date ? new Date(dto.purchase_date) : undefined,
          purchase_price: dto.purchase_price ? new Prisma.Decimal(dto.purchase_price) : undefined,
          source_of_funds: dto.source_of_funds,
        },
        include: {
          category: true,
          location: true,
        },
      });

      // Write mutations
      if (mutationsToCreate.length > 0) {
        await tx.inventoryMutation.createMany({
          data: mutationsToCreate,
        });
      }

      return updatedItem;
    });
  }

  async deleteItem(tenantUuid: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });

    if (!item) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return this.prisma.inventoryItem.delete({
      where: { id },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  MUTATIONS & ADJUSTMENTS
  // ═══════════════════════════════════════════════════════════════

  async recordMutation(tenantUuid: string, itemId: string, dto: CreateInventoryMutationDto, userId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, tenant_uuid: tenantUuid },
    });

    if (!item) {
      throw new NotFoundException('Barang tidak ditemukan');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Calculate new quantity
      let newQty = item.quantity;
      if (dto.type === 'in') {
        newQty += dto.quantity;
      } else if (dto.type === 'out') {
        newQty = Math.max(0, item.quantity - dto.quantity);
      }

      // 2. Update item quantity if modified
      if (newQty !== item.quantity) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { quantity: newQty },
        });
      }

      // 3. Record mutation
      return tx.inventoryMutation.create({
        data: {
          tenant_uuid: tenantUuid,
          item_id: itemId,
          type: dto.type,
          quantity: dto.quantity,
          from_location: dto.from_location,
          to_location: dto.to_location,
          description: dto.description,
          created_by: userId,
        },
      });
    });
  }

  async findMutations(tenantUuid: string, itemId?: string) {
    const where: Prisma.InventoryMutationWhereInput = {
      tenant_uuid: tenantUuid,
    };

    if (itemId) {
      where.item_id = itemId;
    }

    return this.prisma.inventoryMutation.findMany({
      where,
      include: {
        item: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
