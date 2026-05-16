import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateOutletDto,
  UpdateOutletDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateUnitDto,
  UpdateUnitDto,
  CreateProductDto,
  UpdateProductDto,
  StockInDto,
  CreateOpnameDto,
  CompleteOpnameDto,
  CreatePromotionDto,
  OpenSessionDto,
  CloseSessionDto,
  CheckoutDto,
  UpdateOrderStatusDto,
} from './dto/koperasi.dto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class KoperasiService implements OnModuleInit {
  private readonly logger = new Logger(KoperasiService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService
  ) {}

  onModuleInit() {
    this.startAutoCancelTask();
  }

  private startAutoCancelTask() {
    // Run every 1 hour
    setInterval(async () => {
      try {
        await this.autoCancelOldOrders();
      } catch (err) {
        this.logger.error('Auto Cancel Task Failed:', err);
      }
    }, 60 * 60 * 1000);
    
    // Also run once on startup
    this.autoCancelOldOrders().catch(err => this.logger.error('Initial Auto Cancel Failed:', err));
  }

  async autoCancelOldOrders() {
    const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const expiredOrders = await this.prisma.posOrder.updateMany({
      where: {
        order_type: 'mobile_order',
        status: 'pending',
        created_at: { lt: expiredTime }
      },
      data: {
        status: 'cancelled',
        notes: 'Otomatis dibatalkan oleh sistem (Expired 24 Jam)'
      }
    });

    if (expiredOrders.count > 0) {
      this.logger.log(`Auto cancelled ${expiredOrders.count} expired mobile orders.`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  RFID LOOKUP & SPENDING LIMITS
  // ═══════════════════════════════════════════════════════════
  async lookupByRfid(tenantUuid: string, rfid: string) {
    if (!rfid || rfid.trim() === '') {
      throw new BadRequestException('Nomor kartu RFID wajib diisi');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        tenant_uuid: tenantUuid,
        rfid: rfid.trim(),
        deleted_at: null,
        status: 'AKTIF',
      },
      include: {
        wallet: {
          select: {
            id: true, balance: true, pin: true, is_active: true,
            daily_spending_limit: true, weekly_spending_limit: true,
          },
        },
        classroom: { select: { name: true } },
        dormitory: { select: { name: true } },
        dormitory_room: { select: { name: true } },
      },
    });

    if (!student) {
      throw new NotFoundException('Kartu RFID tidak terdaftar atau santri tidak aktif');
    }
    if (!student.wallet) {
      throw new BadRequestException('Santri belum memiliki e-wallet');
    }
    if (!student.wallet.is_active) {
      throw new BadRequestException('E-wallet santri dinonaktifkan');
    }

    const todaySpent = await this.getTodaySpending(student.wallet.id);
    const weekSpent = await this.getWeekSpending(student.wallet.id);
    const dailyLimit = student.wallet.daily_spending_limit
      ? Number(student.wallet.daily_spending_limit)
      : null;
    const weeklyLimit = student.wallet.weekly_spending_limit
      ? Number(student.wallet.weekly_spending_limit)
      : null;

    return {
      student_id: student.id,
      name: student.name,
      nis: student.nis,
      photo: student.photo,
      classroom: student.classroom?.name,
      dormitory: student.dormitory?.name,
      dormitory_room: student.dormitory_room?.name,
      wallet_id: student.wallet.id,
      balance: Number(student.wallet.balance),
      has_pin: !!student.wallet.pin,
      daily_spending_limit: dailyLimit,
      weekly_spending_limit: weeklyLimit,
      today_spent: todaySpent,
      week_spent: weekSpent,
      remaining_daily_limit: dailyLimit !== null ? Math.max(0, dailyLimit - todaySpent) : null,
      remaining_weekly_limit: weeklyLimit !== null ? Math.max(0, weeklyLimit - weekSpent) : null,
    };
  }

  async getTodaySpending(walletId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await this.prisma.walletTransaction.aggregate({
      where: {
        wallet_id: walletId,
        type: 'payment',
        created_at: { gte: today, lt: tomorrow },
      },
      _sum: { amount: true },
    });
    return Number(result._sum?.amount || 0);
  }

  async getWeekSpending(walletId: string): Promise<number> {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const result = await this.prisma.walletTransaction.aggregate({
      where: {
        wallet_id: walletId,
        type: 'payment',
        created_at: { gte: monday, lt: nextMonday },
      },
      _sum: { amount: true },
    });
    return Number(result._sum?.amount || 0);
  }

  private async checkSpendingLimits(walletId: string, amount: number, dailyLimit: any, weeklyLimit: any) {
    if (dailyLimit !== null && dailyLimit !== undefined) {
      const limit = Number(dailyLimit);
      const todaySpent = await this.getTodaySpending(walletId);
      if (todaySpent + amount > limit) {
        const remaining = Math.max(0, limit - todaySpent);
        throw new BadRequestException(
          `Melebihi batas jajan HARIAN! Limit: Rp ${limit.toLocaleString('id-ID')}, ` +
          `Sudah dipakai: Rp ${todaySpent.toLocaleString('id-ID')}, ` +
          `Sisa: Rp ${remaining.toLocaleString('id-ID')}`,
        );
      }
    }
    if (weeklyLimit !== null && weeklyLimit !== undefined) {
      const limit = Number(weeklyLimit);
      const weekSpent = await this.getWeekSpending(walletId);
      if (weekSpent + amount > limit) {
        const remaining = Math.max(0, limit - weekSpent);
        throw new BadRequestException(
          `Melebihi batas jajan MINGGUAN! Limit: Rp ${limit.toLocaleString('id-ID')}, ` +
          `Sudah dipakai: Rp ${weekSpent.toLocaleString('id-ID')}, ` +
          `Sisa: Rp ${remaining.toLocaleString('id-ID')}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  OUTLETS
  // ═══════════════════════════════════════════════════════════
  async getOutlets(tenantUuid: string) {
    if (!tenantUuid) return [];
    return this.prisma.koperasiOutlet.findMany({
      where: { tenant_uuid: tenantUuid },
      include: {
        _count: { select: { products: true, pos_sessions: true } }
      },
      orderBy: { name: 'asc' }
    });
  }

  async createOutlet(tenantUuid: string, dto: CreateOutletDto) {
    return this.prisma.koperasiOutlet.create({
      data: {
        tenant_uuid: tenantUuid,
        ...dto
      }
    });
  }

  async updateOutlet(tenantUuid: string, id: string, dto: UpdateOutletDto) {
    const outlet = await this.prisma.koperasiOutlet.findFirst({
      where: { id, tenant_uuid: tenantUuid }
    });
    if (!outlet) throw new NotFoundException('Outlet tidak ditemukan');
    return this.prisma.koperasiOutlet.update({ where: { id }, data: dto });
  }

  // ═══════════════════════════════════════════════════════════
  //  CATEGORIES
  // ═══════════════════════════════════════════════════════════
  async getCategories(tenantUuid: string, outletId?: string) {
    if (!tenantUuid) return [];
    const where: any = { tenant_uuid: tenantUuid };
    if (outletId) {
      where.OR = [
        { outlet_id: outletId },
        { outlet_id: null },
      ];
    }
    return this.prisma.productCategory.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(tenantUuid: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { tenant_uuid: tenantUuid, name: dto.name }
    });
    if (existing) throw new ConflictException('Kategori dengan nama tersebut sudah ada');

    return this.prisma.productCategory.create({
      data: {
        tenant_uuid: tenantUuid,
        outlet_id: dto.outlet_id,
        name: dto.name,
        icon: dto.icon,
        sort_order: dto.sort_order ?? 0,
      },
    });
  }

  async updateCategory(tenantUuid: string, id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan');

    return this.prisma.productCategory.update({
      where: { id },
      data: { ...dto },
    });
  }

  async deleteCategory(tenantUuid: string, id: string) {
    const cat = await this.prisma.productCategory.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan');

    const productCount = await this.prisma.product.count({
      where: { category_id: id },
    });
    if (productCount > 0) {
      throw new BadRequestException(`Kategori masih digunakan oleh ${productCount} produk.`);
    }

    await this.prisma.productCategory.delete({ where: { id } });
    return { message: 'Kategori berhasil dihapus' };
  }

  // ═══════════════════════════════════════════════════════════
  //  UNITS
  // ═══════════════════════════════════════════════════════════
  async getUnits(tenantUuid: string, outletId?: string) {
    const where: any = { tenant_uuid: tenantUuid };
    if (outletId) {
      where.OR = [
        { outlet_id: outletId },
        { outlet_id: null },
      ];
    }
    return this.prisma.productUnit.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createUnit(tenantUuid: string, dto: CreateUnitDto) {
    const existing = await this.prisma.productUnit.findFirst({
      where: { tenant_uuid: tenantUuid, name: dto.name },
    });
    if (existing)
      throw new ConflictException('Satuan dengan nama tersebut sudah ada');

    return this.prisma.productUnit.create({
      data: {
        tenant_uuid: tenantUuid,
        outlet_id: dto.outlet_id,
        name: dto.name,
      },
    });
  }

  async updateUnit(tenantUuid: string, id: string, dto: UpdateUnitDto) {
    const unit = await this.prisma.productUnit.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!unit) throw new NotFoundException('Satuan tidak ditemukan');

    return this.prisma.productUnit.update({
      where: { id },
      data: { ...dto },
    });
  }

  async deleteUnit(tenantUuid: string, id: string) {
    const unit = await this.prisma.productUnit.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!unit) throw new NotFoundException('Satuan tidak ditemukan');

    const productCount = await this.prisma.product.count({
      where: { unit_id: id },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Satuan masih digunakan oleh ${productCount} produk.`,
      );
    }

    await this.prisma.productUnit.delete({ where: { id } });
    return { message: 'Satuan berhasil dihapus' };
  }

  // ═══════════════════════════════════════════════════════════
  //  PRODUCTS
  // ═══════════════════════════════════════════════════════════
  async getProducts(tenantUuid: string, query?: { search?: string; outlet_id?: string; category_id?: string; is_active?: string; page?: number; limit?: number; }) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const where: any = { tenant_uuid: tenantUuid };

    if (query?.outlet_id) where.outlet_id = query.outlet_id;
    if (query?.category_id) where.category_id = query.category_id;
    if (query?.is_active !== undefined) where.is_active = query.is_active === 'true';
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { 
          category: { select: { id: true, name: true } }, 
          product_unit: { select: { id: true, name: true } },
          outlet: { select: { name: true } },
          promo_products: {
            include: {
              promotion: true
            }
          }
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createProduct(tenantUuid: string, userId: string, dto: CreateProductDto) {
    const outlet = await this.prisma.koperasiOutlet.findFirst({ where: { id: dto.outlet_id, tenant_uuid: tenantUuid } });
    if (!outlet) throw new NotFoundException('Outlet tidak ditemukan');

    const price = new Prisma.Decimal(dto.price);
    const costPrice = new Prisma.Decimal(dto.cost_price ?? 0);
    
    // Calc margin
    let marginPercent = new Prisma.Decimal(dto.margin_percent ?? 0);
    if (!dto.margin_percent && price.toNumber() > 0) {
        const marginVal = ((price.toNumber() - costPrice.toNumber()) / price.toNumber()) * 100;
        marginPercent = new Prisma.Decimal(marginVal.toFixed(2));
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenant_uuid: tenantUuid,
          outlet_id: dto.outlet_id,
          name: dto.name,
          category_id: dto.category_id || null,
          sku: dto.sku || null,
          barcode: dto.barcode || null,
          description: dto.description || null,
          price,
          cost_price: costPrice,
          margin_percent: marginPercent,
          stock: dto.stock ?? 0,
          min_stock: dto.min_stock ?? 5,
          image_url: dto.image_url || null,
          unit: dto.unit || 'pcs',
          unit_id: dto.unit_id || null,
          supplier_name: dto.supplier_name || null,
          supplier_phone: dto.supplier_phone || null,
          track_stock: dto.track_stock ?? true,
        },
      });

      // Jika ada stok awal, catat sebagai mutasi (sinkron dengan laporan)
      if (dto.stock && dto.stock > 0) {
        await tx.stockMovement.create({
          data: {
            tenant_uuid: tenantUuid,
            outlet_id: dto.outlet_id,
            product_id: product.id,
            type: 'opname_adjust',
            quantity: dto.stock,
            cost_price: costPrice,
            stock_before: 0,
            stock_after: dto.stock,
            reference: 'STOK_AWAL',
            notes: 'Saldo awal produk baru',
            created_by: userId
          }
        });
      }

      return product;
    });
  }

  async updateProduct(tenantUuid: string, id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id, tenant_uuid: tenantUuid } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    const data: any = { ...dto };
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.cost_price !== undefined) data.cost_price = new Prisma.Decimal(dto.cost_price);
    if (dto.margin_percent !== undefined) data.margin_percent = new Prisma.Decimal(dto.margin_percent);
    
    // Auto calc margin if price or cost_price changes and margin is not explicitly provided
    if (dto.price !== undefined || dto.cost_price !== undefined) {
      const p = dto.price !== undefined ? dto.price : Number(product.price);
      const c = dto.cost_price !== undefined ? dto.cost_price : Number(product.cost_price);
      if (p > 0 && dto.margin_percent === undefined) {
        const m = ((p - c) / p) * 100;
        data.margin_percent = new Prisma.Decimal(m.toFixed(2));
      }
    }

    return this.prisma.product.update({ where: { id }, data });
  }

  async deleteProduct(tenantUuid: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenant_uuid: tenantUuid },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    // Cek apakah sudah ada transaksi
    const orderItemCount = await this.prisma.posOrderItem.count({
      where: { product_id: id },
    });

    if (orderItemCount > 0) {
      throw new BadRequestException(
        `Produk tidak bisa dihapus karena sudah memiliki ${orderItemCount} transaksi. Silakan nonaktifkan status produk sebagai gantinya.`,
      );
    }

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Produk berhasil dihapus' };
  }

  // ═══════════════════════════════════════════════════════════
  //  STOCK MANAGEMENT (IN & OPNAME)
  // ═══════════════════════════════════════════════════════════
  async stockIn(tenantUuid: string, userId: string, dto: StockInDto) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.product_id, tenant_uuid: tenantUuid, outlet_id: dto.outlet_id } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      const stockBefore = product.stock;
      const stockAfter = stockBefore + dto.quantity;
      
      // Sinkronkan harga modal (HPP) lama dan baru dengan metode Weighted Average Cost (WAC)
      let costPrice = product.cost_price;
      let marginPercent = product.margin_percent;
      if (dto.cost_price !== undefined && dto.cost_price > 0 && dto.quantity > 0) {
        const oldTotal = Number(product.cost_price) * (stockBefore > 0 ? stockBefore : 0);
        const newTotal = Number(dto.cost_price) * dto.quantity;
        const validStockAfter = (stockBefore > 0 ? stockBefore : 0) + dto.quantity;
        const avgCost = validStockAfter > 0 ? (oldTotal + newTotal) / validStockAfter : Number(dto.cost_price);
        costPrice = new Prisma.Decimal(avgCost.toFixed(2));

        // Re-calculate margin based on new avg HPP
        const p = Number(product.price);
        const c = Number(costPrice);
        if (p > 0) {
          marginPercent = new Prisma.Decimal((((p - c) / p) * 100).toFixed(2));
        }
      }

      // Update product stock and calculated average cost_price
      await tx.product.update({
        where: { id: product.id },
        data: { stock: stockAfter, cost_price: costPrice, margin_percent: marginPercent }
      });

      // Record movement
      return tx.stockMovement.create({
        data: {
          tenant_uuid: tenantUuid,
          outlet_id: dto.outlet_id,
          product_id: product.id,
          type: 'purchase_in',
          quantity: dto.quantity,
          cost_price: costPrice,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reference: dto.reference,
          supplier_name: dto.supplier_name || product.supplier_name,
          notes: dto.notes,
          created_by: userId
        }
      });
    });
  }

  async getStockMovements(tenantUuid: string, query?: { 
    outlet_id?: string; 
    product_id?: string; 
    type?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    page?: number; 
    limit?: number 
  }) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const where: any = { tenant_uuid: tenantUuid };
    
    if (query?.outlet_id) where.outlet_id = query.outlet_id;
    if (query?.product_id) where.product_id = query.product_id;
    if (query?.type && query.type.trim() !== '') where.type = query.type;
    
    if (query?.search && query.search.trim() !== '') {
      where.product = {
        name: { contains: query.search, mode: 'insensitive' }
      };
    }

    if (query?.date_from || query?.date_to) {
      where.created_at = {};
      if (query.date_from && query.date_from.trim() !== '') {
        where.created_at.gte = new Date(query.date_from);
      }
      if (query.date_to && query.date_to.trim() !== '') {
        const toDate = new Date(query.date_to);
        toDate.setHours(23, 59, 59, 999);
        where.created_at.lte = toDate;
      }
      // Clean up if empty
      if (Object.keys(where.created_at).length === 0) delete where.created_at;
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: { 
          product: { select: { name: true } }
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async adjustStock(tenantUuid: string, userId: string, dto: { product_id: string; outlet_id: string; quantity: number; type: string; notes?: string }) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.product_id, outlet_id: dto.outlet_id, tenant_uuid: tenantUuid } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    const stockBefore = product.stock;
    const stockAfter = stockBefore + dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { stock: stockAfter } });
      return tx.stockMovement.create({
        data: {
          tenant_uuid: tenantUuid,
          outlet_id: dto.outlet_id,
          product_id: product.id,
          type: dto.type,
          quantity: dto.quantity,
          stock_before: stockBefore,
          stock_after: stockAfter,
          notes: dto.notes,
          created_by: userId
        }
      });
    });
  }

  async createStockOpname(tenantUuid: string, userId: string, dto: CreateOpnameDto) {
    const outlet = await this.prisma.koperasiOutlet.findFirst({ where: { id: dto.outlet_id, tenant_uuid: tenantUuid } });
    if (!outlet) throw new NotFoundException('Outlet tidak ditemukan');
    
    // Check if there is an active draft
    const draft = await this.prisma.stockOpname.findFirst({ where: { outlet_id: dto.outlet_id, status: 'draft' } });
    if (draft) return draft; // Return existing draft instead of throwing error

    const opnameNo = `OPN-${Date.now()}`;
    return this.prisma.stockOpname.create({
      data: {
        tenant_uuid: tenantUuid,
        outlet_id: dto.outlet_id,
        opname_no: opnameNo,
        date: new Date(),
        status: 'draft',
        notes: dto.notes,
        created_by: userId
      }
    });
  }

  async cancelOpnameDraft(tenantUuid: string, id: string) {
    if (!id || id === 'undefined') throw new BadRequestException('ID sesi tidak valid');
    
    const draft = await this.prisma.stockOpname.findFirst({
      where: { id, tenant_uuid: tenantUuid, status: 'draft' }
    });
    if (!draft) throw new NotFoundException('Draft opname tidak ditemukan');

    // Delete items first due to relation
    await this.prisma.stockOpnameItem.deleteMany({ where: { opname_id: id } });
    await this.prisma.stockOpname.delete({ where: { id } });
    
    return { message: 'Sesi opname berhasil dibatalkan' };
  }

  async getOpnameDraft(tenantUuid: string, outletId: string) {
    return this.prisma.stockOpname.findFirst({
      where: { tenant_uuid: tenantUuid, outlet_id: outletId, status: 'draft' }
    });
  }

  async completeStockOpname(tenantUuid: string, userId: string, dto: CompleteOpnameDto) {
    const opname = await this.prisma.stockOpname.findFirst({ where: { id: dto.opname_id, tenant_uuid: tenantUuid, status: 'draft' } });
    if (!opname) throw new NotFoundException('Sesi opname tidak valid atau sudah selesai');

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const product = await tx.product.findFirst({ where: { id: item.product_id, outlet_id: opname.outlet_id } });
        if (!product) continue;

        const systemStock = product.stock;
        const actualStock = item.actual_stock;
        const diff = actualStock - systemStock;

        // Create item record
        await tx.stockOpnameItem.create({
          data: {
            opname_id: opname.id,
            product_id: product.id,
            system_stock: systemStock,
            actual_stock: actualStock,
            difference: diff,
            notes: item.notes
          }
        });

        // Update product stock and record movement if changed
        if (diff !== 0) {
          await tx.product.update({ where: { id: product.id }, data: { stock: actualStock } });
          await tx.stockMovement.create({
            data: {
              tenant_uuid: tenantUuid,
              outlet_id: opname.outlet_id,
              product_id: product.id,
              type: 'opname_adjust',
              quantity: diff,
              stock_before: systemStock,
              stock_after: actualStock,
              reference: opname.opname_no,
              created_by: userId
            }
          });
        }
      }

      return tx.stockOpname.update({
        where: { id: opname.id },
        data: { status: 'completed', completed_at: new Date() }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PROMOTIONS
  // ═══════════════════════════════════════════════════════════
  async getPromotions(tenantUuid: string, outletId: string) {
    return this.prisma.promotion.findMany({
      where: { tenant_uuid: tenantUuid, outlet_id: outletId },
      include: { products: { include: { product: { select: { name: true } } } } },
      orderBy: { created_at: 'desc' }
    });
  }

  async createPromotion(tenantUuid: string, dto: CreatePromotionDto) {
    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.create({
        data: {
          tenant_uuid: tenantUuid,
          outlet_id: dto.outlet_id,
          name: dto.name,
          description: dto.description,
          discount_type: dto.discount_type,
          discount_value: new Prisma.Decimal(dto.discount_value),
          min_purchase: new Prisma.Decimal(dto.min_purchase ?? 0),
          max_discount: dto.max_discount ? new Prisma.Decimal(dto.max_discount) : null,
          apply_to: dto.apply_to,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          usage_limit: dto.usage_limit
        }
      });

      if (dto.apply_to === 'selected_products' && dto.product_ids?.length) {
        await tx.promotionProduct.createMany({
          data: dto.product_ids.map(pid => ({ promotion_id: promo.id, product_id: pid }))
        });
      }
      return promo;
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  POS CHECKOUT (Enhanced)
  // ═══════════════════════════════════════════════════════════
  async checkout(tenantUuid: string, cashierId: string, dto: CheckoutDto) {
    const orderType = dto.order_type || 'sale'; // sale, bill_payment, topup, withdrawal
    const orderNo = `POS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    let subtotal = 0;
    let discount = dto.discount ?? 0;
    let total = 0;
    let walletTxRef: string | null = null;
    let promoData: any = null;
    const orderItems: any[] = [];

    // Validation: Topup, Withdrawal, and Bill Payment REQUIRE a student
    if ((orderType === 'topup' || orderType === 'withdrawal' || orderType === 'bill_payment') && !dto.student_id) {
      throw new BadRequestException('Pilih santri terlebih dahulu untuk transaksi ini');
    }

    try {
      // 1. Process Items (If Sale)
      if (orderType === 'sale') {
        if (!dto.items?.length) throw new BadRequestException('Keranjang kosong');
        
        const productIds = dto.items.map((i) => i.product_id);
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds }, tenant_uuid: tenantUuid, outlet_id: dto.outlet_id, is_active: true },
          include: { promo_products: true }
        });

        const productMap = new Map(products.map((p) => [p.id, p]));
        
        // Fetch all active promos for automatic item discounts
        const now = new Date();
        const allActivePromos = await this.prisma.promotion.findMany({
          where: { 
            outlet_id: dto.outlet_id, 
            is_active: true,
            start_date: { lte: now },
            end_date: { gte: now }
          }
        });

        // Reset discount to recalculate on backend
        discount = 0;

        for (const item of dto.items) {
          const product = productMap.get(item.product_id);
          if (!product) throw new BadRequestException(`Produk tidak ditemukan`);

          if (product.track_stock && product.stock < item.quantity) {
            throw new BadRequestException(`Stok "${product.name}" tidak mencukupi (tersedia: ${product.stock})`);
          }

          const itemTotal = Number(product.price) * item.quantity;
          subtotal += itemTotal;
          
          // Calculate automatic item discount (best one excluding dto.promo_id)
          const applicableItemPromos = allActivePromos.filter(p => {
            if (p.id === dto.promo_id) return false; // This one is order-level
            if (p.apply_to === 'all') return true;
            return product.promo_products?.some(pp => pp.promotion_id === p.id);
          });

          let bestItemDisc = 0;
          for (const p of applicableItemPromos) {
            let d = 0;
            if (p.discount_type === 'percentage') {
              d = Number(product.price) * (Number(p.discount_value) / 100);
              if (p.max_discount && d > Number(p.max_discount)) d = Number(p.max_discount);
            } else {
              d = Number(p.discount_value);
            }
            if (d > bestItemDisc) bestItemDisc = d;
          }
          discount += (bestItemDisc * item.quantity);

          orderItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: item.quantity,
            unit_price: Number(product.price),
            cost_price: Number(product.cost_price),
            subtotal: itemTotal,
          });
        }

        // Handle Order-Level Promotion
        if (dto.promo_id) {
          const promo = allActivePromos.find(p => p.id === dto.promo_id);
          if (promo) {
             let applicableAmount = subtotal;
             if (promo.apply_to === 'selected_products') {
               const promoWithItems = await this.prisma.promotion.findUnique({ where: { id: promo.id }, include: { products: true } });
               const eligibleProductIds = promoWithItems?.products.map(p => p.product_id) || [];
               applicableAmount = orderItems
                 .filter(item => eligibleProductIds.includes(item.product_id))
                 .reduce((sum, item) => sum + item.subtotal, 0);
             }

             if (applicableAmount > 0 && subtotal >= Number(promo.min_purchase)) {
               promoData = promo;
               if (promo.discount_type === 'percentage') {
                 let discVal = applicableAmount * (Number(promo.discount_value) / 100);
                 if (promo.max_discount && discVal > Number(promo.max_discount)) discVal = Number(promo.max_discount);
                 discount += discVal;
               } else {
                 discount += Number(promo.discount_value);
               }
             }
          }
        }

        total = subtotal - discount;
      
      // Add extra amounts for combined sale
      if (orderType === 'sale') {
        if (dto.topup_amount) {
          subtotal += Number(dto.topup_amount);
          total += Number(dto.topup_amount);
        }
        if (dto.withdrawal_amount) {
          subtotal += Number(dto.withdrawal_amount);
          total += Number(dto.withdrawal_amount);
        }
      }
    } 
    // 2. Process Bill Payment / Topup / Withdrawal (Standalone)
    else {
      if (!dto.amount || dto.amount <= 0) throw new BadRequestException('Nominal tidak valid');
      subtotal = dto.amount;
      total = subtotal - discount;
    } 

    if (total < 0) throw new BadRequestException('Total tidak valid');

    // 2.1 Handle Xendit Dynamic QRIS Generation
    let qrisData: any = null;
    if (dto.payment_method === 'qris' && total > 0) {
      const pesantren = await this.prisma.pesantren.findUnique({
        where: { id: tenantUuid },
        select: { xendit_sub_account_id: true }
      });
      
      const xenditKey = this.config.get<string>('XENDIT_SECRET_KEY');
      if (xenditKey && pesantren?.xendit_sub_account_id) {
        try {
          const baseUrl = this.config.get<string>('XENDIT_API_URL', 'https://api.xendit.co');
          const headers = {
            'Authorization': `Basic ${Buffer.from(xenditKey + ':').toString('base64')}`,
            'Content-Type': 'application/json',
            'for-user-id': pesantren.xendit_sub_account_id
          };
          
          const resp = await fetch(`${baseUrl}/qr_codes`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              external_id: orderNo,
              type: 'DYNAMIC',
              amount: total,
            })
          });
          const qrRes = await resp.json();
          if (resp.ok) {
            qrisData = {
              qr_string: qrRes.qr_string,
              id: qrRes.id,
              external_id: qrRes.external_id
            };
          } else {
            this.logger.error('Xendit QR Error Response:', qrRes);
            throw new BadRequestException(`Xendit QR Error: ${qrRes.message || 'Gagal membuat QR Code'}`);
          }
        } catch (err) {
          if (err instanceof BadRequestException) throw err;
          this.logger.error('QRIS Generation Exception:', err);
          throw new BadRequestException('Gagal membuat QRIS. Periksa koneksi internet atau konfigurasi Xendit.');
        }
      } else if (dto.payment_method === 'qris') {
        throw new BadRequestException('Pesantren belum dikonfigurasi dengan Xendit untuk pembayaran QRIS.');
      }
    }

    // 3. Wallet / Debt Verification
    if ((dto.payment_method === 'wallet' || dto.payment_method === 'debt') && orderType !== 'topup') {
      if (!dto.student_id) throw new BadRequestException(`Pilih santri untuk pembayaran ${dto.payment_method === 'debt' ? 'hutang' : 'wallet'}`);

      const wallet = await this.prisma.wallet.findFirst({
        where: { student_id: dto.student_id, tenant_uuid: tenantUuid },
      });
      if (!wallet) throw new BadRequestException('Santri belum memiliki wallet');
      
      // If payment is 'wallet' (not debt), check balance
      if (dto.payment_method === 'wallet' && Number(wallet.balance) < total) {
        throw new BadRequestException(`Saldo wallet tidak mencukupi (Rp ${Number(wallet.balance).toLocaleString('id-ID')})`);
      }

      // Check daily/weekly spending limits (only for wallet/debt payments that deduct)
      if (orderType === 'sale' || orderType === 'bill_payment' || orderType === 'withdrawal') {
        await this.checkSpendingLimits(
          wallet.id, total,
          wallet.daily_spending_limit,
          wallet.weekly_spending_limit,
        );
      }

      // Both wallet and debt usually require PIN for security
      if (orderType !== 'topup') {
        if (!dto.pin) throw new BadRequestException('PIN transaksi wajib diisi');
        if (!wallet.pin) throw new BadRequestException('PIN wallet belum diatur oleh santri');
        const isValid = await bcrypt.compare(dto.pin, wallet.pin);
        if (!isValid) throw new BadRequestException('PIN yang Anda masukkan salah');
      }

      walletTxRef = orderNo;
    }

    // 4. Execute Transaction
    return await this.prisma.$transaction(async (tx) => {
        // Create order
        const order = await tx.posOrder.create({
          data: {
            pesantren: { connect: { id: tenantUuid } },
            outlet: { connect: { id: dto.outlet_id } },
            cashier: { connect: { id: cashierId } },
            order_no: orderNo,
            order_type: orderType,
            session: dto.session_id ? { connect: { id: dto.session_id } } : undefined,
            student: dto.student_id ? { connect: { id: dto.student_id } } : undefined,
            bill_id: dto.bill_id || null,
            subtotal: new Prisma.Decimal(subtotal || 0),
            discount: new Prisma.Decimal(discount || 0),
            promo_id: promoData?.id || null,
            promo_name: promoData?.name || null,
            total: new Prisma.Decimal(total || 0),
            payment_method: dto.payment_method,
            wallet_tx_ref: walletTxRef || null,
            status: dto.payment_method === 'qris' ? 'pending' : 'completed',
            notes: (dto.notes ? dto.notes + ' ' : '') + (dto.topup_amount ? `__TOPUP__:${dto.topup_amount}` : dto.withdrawal_amount ? `__WITHDRAWAL__:${dto.withdrawal_amount}` : ''),
            items: {
              create: orderItems.map((item) => ({
                product: { connect: { id: item.product_id } },
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: new Prisma.Decimal(item.unit_price || 0),
                cost_price: new Prisma.Decimal(item.cost_price || 0),
                subtotal: new Prisma.Decimal(item.subtotal || 0),
              })),
            },
          },
          include: { 
            items: true, 
            student: { select: { name: true, nis: true } },
            cashier: { select: { name: true } }
          },
        });

        // Update Promo usage
        if (promoData) {
          await tx.promotion.update({ where: { id: promoData.id }, data: { usage_count: { increment: 1 } } });
        }

        // Process Sale (Stock Update)
        // ONLY update stock if not pending (QRIS stays pending until webhook)
        if (orderType === 'sale' && dto.payment_method !== 'qris') {
          for (const item of orderItems) {
            const product = await tx.product.findUnique({ where: { id: item.product_id }});
            if (product?.track_stock) {
              await tx.product.update({ where: { id: item.product_id }, data: { stock: { decrement: item.quantity } } });
              await tx.stockMovement.create({
                data: {
                  tenant_uuid: tenantUuid,
                  outlet_id: dto.outlet_id,
                  product_id: product.id,
                  type: 'sale_out',
                  quantity: -item.quantity,
                  stock_before: product.stock,
                  stock_after: product.stock - item.quantity,
                  reference: orderNo,
                  created_by: cashierId
                }
              });
            }
          }
        }

        // Process Wallet / Debt Operations
        if (dto.student_id && dto.payment_method !== 'qris') {
          const wallet = await tx.wallet.findFirst({ where: { student_id: dto.student_id, tenant_uuid: tenantUuid } });
          if (wallet) {
            if ((dto.payment_method === 'wallet' || dto.payment_method === 'debt') && (orderType === 'sale' || orderType === 'bill_payment' || orderType === 'withdrawal')) {
               const balanceBefore = wallet.balance;
               const balanceAfter = Prisma.Decimal.sub(balanceBefore, new Prisma.Decimal(total));
               await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
               await tx.walletTransaction.create({
                  data: {
                    pesantren: { connect: { id: tenantUuid } },
                    wallet: { connect: { id: wallet.id } },
                    type: dto.payment_method === 'debt' ? 'payment' : (orderType === 'withdrawal' ? 'withdrawal' : 'payment'),
                    amount: new Prisma.Decimal(total),
                    balance_before: balanceBefore,
                    balance_after: balanceAfter,
                    reference: orderNo,
                    description: (dto.payment_method === 'debt' ? '[HUTANG] ' : '') + (orderType === 'sale' ? `Belanja POS #${orderNo}${dto.withdrawal_amount ? ' (Incl. Tarik Tunai)' : ''}` : orderType === 'bill_payment' ? `Bayar Tagihan via POS` : `Tarik Tunai POS`),
                  },
               });
            } else if (orderType === 'topup' && dto.payment_method === 'cash') {
               // Admin receives cash, topup wallet (Standalone Topup)
               const balanceBefore = wallet.balance;
               const balanceAfter = Prisma.Decimal.add(balanceBefore, new Prisma.Decimal(total));
               await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
               await tx.walletTransaction.create({
                  data: {
                    pesantren: { connect: { id: tenantUuid } },
                    wallet: { connect: { id: wallet.id } },
                    type: 'deposit',
                    amount: new Prisma.Decimal(total),
                    balance_before: balanceBefore,
                    balance_after: balanceAfter,
                    reference: orderNo,
                    description: `Topup Tunai POS`,
                  },
               });
            }

            // Handle combined Topup/Withdrawal in Sale
            if (orderType === 'sale' && dto.payment_method !== 'qris') {
              if (dto.topup_amount && dto.topup_amount > 0) {
                const bBefore = wallet.balance;
                const bAfter = Prisma.Decimal.add(bBefore, new Prisma.Decimal(dto.topup_amount));
                await tx.wallet.update({ where: { id: wallet.id }, data: { balance: bAfter } });
                await tx.walletTransaction.create({
                  data: {
                    pesantren: { connect: { id: tenantUuid } },
                    wallet: { connect: { id: wallet.id } },
                    type: 'deposit',
                    amount: new Prisma.Decimal(dto.topup_amount),
                    balance_before: bBefore,
                    balance_after: bAfter,
                    reference: orderNo,
                    description: `Topup (Sekalian Belanja) #${orderNo}`,
                  },
                });
              }
            }
          }
        }

        // Process Bill Payment Logic (Existing Bill System Integration)
        if (orderType === 'bill_payment' && dto.bill_id && dto.payment_method !== 'qris') {
          const bill = await tx.bill.findFirst({ where: { id: dto.bill_id, tenant_uuid: tenantUuid }});
          if (bill) {
            const newPaid = Number(bill.amount_paid) + total;
            await tx.bill.update({
              where: { id: bill.id },
              data: {
                amount_paid: new Prisma.Decimal(newPaid),
                status: newPaid >= Number(bill.amount) ? 'paid' : 'partial'
              }
            });
            await tx.transaction.create({
              data: {
                pesantren: { connect: { id: tenantUuid } },
                student: { connect: { id: bill.student_id } },
                bill: { connect: { id: bill.id } },
                fee_category: bill.fee_category_id ? { connect: { id: bill.fee_category_id } } : undefined,
                reference_no: orderNo, // Use POS order No
                amount_paid: new Prisma.Decimal(total),
                payment_method: dto.payment_method, // wallet or cash
                status: 'success'
              }
            });
          }
        }

        return { ...order, qrisData };
      });
    } catch (err) {
      this.logger.error('Checkout Error:', err);
      // Determine if error is a Prisma error or a normal exception
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(err.message || 'Gagal memproses transaksi');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SESSION & DASHBOARD
  // ═══════════════════════════════════════════════════════════
  async getActiveSession(tenantUuid: string, cashierId: string) {
    return this.prisma.posSession.findFirst({
      where: { tenant_uuid: tenantUuid, cashier_id: cashierId, closed_at: null },
      include: { outlet: { select: { name: true } }, _count: { select: { orders: true } } },
    });
  }

  async openSession(tenantUuid: string, cashierId: string, dto: OpenSessionDto) {
    const existing = await this.prisma.posSession.findFirst({
      where: { tenant_uuid: tenantUuid, cashier_id: cashierId, closed_at: null },
    });
    if (existing) throw new BadRequestException('Sesi aktif masih terbuka');

    return this.prisma.posSession.create({
      data: {
        tenant_uuid: tenantUuid,
        outlet_id: dto.outlet_id,
        cashier_id: cashierId,
        opening_balance: new Prisma.Decimal(dto.opening_balance ?? 0),
      },
    });
  }

  async closeSession(tenantUuid: string, cashierId: string, dto: CloseSessionDto) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: dto.session_id, tenant_uuid: tenantUuid, closed_at: null },
    });
    if (!session) throw new NotFoundException('Sesi tidak valid');

    const salesAgg = await this.prisma.posOrder.aggregate({
      where: { session_id: session.id, status: 'completed' },
      _sum: { total: true },
      _count: true,
    });

    return this.prisma.posSession.update({
      where: { id: session.id },
      data: {
        closed_at: new Date(),
        closing_balance: dto.closing_balance != null ? new Prisma.Decimal(dto.closing_balance) : null,
        total_sales: salesAgg._sum.total || new Prisma.Decimal(0),
        total_orders: salesAgg._count,
        notes: dto.notes,
      },
    });
  }

  async getDashboardStats(tenantUuid: string, outletId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const whereBase: any = { tenant_uuid: tenantUuid };
    if (outletId) whereBase.outlet_id = outletId;

    const [totalProducts, todaySales, opnames] = await Promise.all([
      this.prisma.product.count({ where: whereBase }),
      this.prisma.posOrder.aggregate({
        where: { ...whereBase, status: 'completed', created_at: { gte: today, lt: tomorrow } },
        _sum: { total: true },
        _count: true
      }),
      this.prisma.stockOpname.findMany({
        where: { ...whereBase, status: 'completed' },
        orderBy: { date: 'desc' },
        take: 5,
        include: { outlet: { select: { name: true } } }
      })
    ]);

    // HPP & Margin analysis (Akurat dengan diskon dan HPP history)
    const salesToday = await this.prisma.posOrder.findMany({
      where: { ...whereBase, status: 'completed', order_type: 'sale', created_at: { gte: today, lt: tomorrow } },
      include: { items: true }
    });

    let totalGrossRevenue = 0; // Omset Kotor (sebelum diskon)
    let totalNetRevenue = 0;   // Omset Bersih (setelah diskon promo)
    let totalHPP = 0;          // Total Modal (Harga Pokok Penjualan)

    salesToday.forEach(order => {
      totalGrossRevenue += Number(order.subtotal);
      totalNetRevenue += Number(order.total);
      order.items.forEach(item => {
        // HPP menggunakan cost_price yang tersimpan di order_item (snapshot harga lama/baru pada saat transaksi)
        totalHPP += (Number(item.cost_price) * item.quantity);
      });
    });
    
    // Pendapatan Kotor (Laba Kotor) = Omset Bersih - Modal (HPP)
    const estimatedGrossProfit = totalNetRevenue - totalHPP;

    return {
      totalProducts,
      todayRevenue: totalNetRevenue,
      todayGrossRevenue: totalGrossRevenue,
      todayOrders: todaySales._count,
      estimatedGrossProfit,
      recentOpnames: opnames
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  ORDERS
  // ═══════════════════════════════════════════════════════════
  async getOrders(tenantUuid: string, query?: { outlet_id?: string; type?: string; search?: string; date_from?: string; date_to?: string; page?: number; limit?: number }) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const where: any = { tenant_uuid: tenantUuid };
    if (query?.outlet_id) where.outlet_id = query.outlet_id;
    if (query?.type) where.order_type = query.type;
    if (query?.search) where.order_no = { contains: query.search, mode: 'insensitive' };
    
    if (query?.date_from || query?.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) {
        const dTo = new Date(query.date_to);
        dTo.setHours(23, 59, 59, 999);
        where.created_at.lte = dTo;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.posOrder.findMany({
        where,
        include: { 
          student: { 
            select: { 
              name: true,
              dormitory: { select: { name: true } },
              dormitory_room: { select: { name: true } }
            } 
          }, 
          cashier: { select: { name: true } }, 
          items: {
            include: {
              product: {
                select: { image_url: true }
              }
            }
          } 
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.posOrder.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ─── MOBILE / WALISANTRI ENDPOINTS ───────────────────────────
  async getProductsForMobile(tenantUuid: string, outletId?: string, categoryId?: string, search?: string) {
    const where: any = { 
      tenant_uuid: tenantUuid, 
      is_active: true,
      outlet: { is_active: true }
    };
    if (outletId) where.outlet_id = outletId;
    if (categoryId) where.category_id = categoryId;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    return this.prisma.product.findMany({
      where,
      include: { 
        category: { select: { name: true } },
        outlet: { select: { name: true } }
      },
      orderBy: { name: 'asc' }
    });
  }

  async getMobileOrders(tenantUuid: string, studentIds: string[]) {
    return this.prisma.posOrder.findMany({
      where: { 
        tenant_uuid: tenantUuid,
        student_id: { in: studentIds },
        order_type: 'mobile_order'
      },
      include: { 
        items: {
          include: {
            product: {
              select: { image_url: true }
            }
          }
        },
        student: { 
          select: { 
            name: true,
            dormitory: { select: { name: true } },
            dormitory_room: { select: { name: true } }
          } 
        },
        outlet: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });
  }

  async updateOrderStatus(tenantUuid: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.posOrder.findFirst({
      where: { id: orderId, tenant_uuid: tenantUuid },
      include: { items: true }
    });
    if (!order) throw new NotFoundException('Order tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      // If completing, we might need to deduct wallet if it's wallet payment and not yet deducted
      // However, for mobile_order, we'll implement it so it deducts when completed if it's e-wallet.
      if (dto.status === 'completed' && order.status !== 'completed') {
        if (order.payment_method === 'wallet' && order.student_id) {
          const wallet = await tx.wallet.findFirst({ where: { student_id: order.student_id } });
          if (!wallet) throw new BadRequestException('Wallet santri tidak ditemukan');
          if (Number(wallet.balance) < Number(order.total)) {
            throw new BadRequestException('Saldo wallet santri tidak mencukupi untuk menyelesaikan transaksi ini');
          }

          const balanceBefore = wallet.balance;
          const balanceAfter = Prisma.Decimal.sub(balanceBefore, order.total);
          
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
          await tx.walletTransaction.create({
            data: {
              tenant_uuid: tenantUuid,
              wallet_id: wallet.id,
              type: 'payment',
              amount: order.total,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              reference: order.order_no,
              description: `Pemesanan Mobile #${order.order_no} selesai`
            }
          });
        }

        // Reduce stock when completed (if not already reduced)
        for (const item of order.items) {
          const product = await tx.product.findUnique({ where: { id: item.product_id } });
          if (product?.track_stock) {
            await tx.product.update({
              where: { id: item.product_id },
              data: { stock: { decrement: item.quantity } }
            });
            await tx.stockMovement.create({
              data: {
                tenant_uuid: tenantUuid,
                outlet_id: order.outlet_id,
                product_id: product.id,
                type: 'sale_out',
                quantity: -item.quantity,
                stock_before: product.stock,
                stock_after: product.stock - item.quantity,
                reference: order.order_no,
                notes: 'Pesanan mobile selesai'
              }
            });
          }
        }
      }

      return tx.posOrder.update({
        where: { id: orderId },
        data: { 
          status: dto.status,
          notes: dto.notes ? `${order.notes || ''}\nUpdate: ${dto.notes}` : order.notes
        }
      });
    });
  }

  async mobileCheckout(tenantUuid: string, userId: string, dto: CheckoutDto) {
    const orderNo = `MOB-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    if (!dto.items?.length) throw new BadRequestException('Keranjang kosong');
    if (!dto.student_id) throw new BadRequestException('Santri harus dipilih');

    // For mobile orders, we find the product and calculate totals
    const productIds = dto.items.map(i => i.product_id);
    const products = await this.prisma.product.findMany({
      where: { 
        id: { in: productIds }, 
        tenant_uuid: tenantUuid, 
        outlet_id: dto.outlet_id,
        is_active: true 
      }
    });
    if (products.length !== Array.from(new Set(productIds)).length) {
      throw new BadRequestException('Beberapa produk tidak tersedia di outlet ini');
    }
    const productMap = new Map(products.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.product_id);
      if (!product) throw new BadRequestException(`Produk tidak ditemukan`);
      
      if (product.track_stock && product.stock < item.quantity) {
        throw new BadRequestException(`Stok ${product.name} tidak mencukupi`);
      }

      const itemTotal = Number(product.price) * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        cost_price: product.cost_price,
        subtotal: itemTotal
      });
    }

    const total = subtotal; 
    
    // Check wallet balance
    const wallet = await this.prisma.wallet.findFirst({
      where: { student_id: dto.student_id, tenant_uuid: tenantUuid }
    });
    if (!wallet) throw new BadRequestException('Santri belum memiliki wallet');
    if (Number(wallet.balance) < total) {
      throw new BadRequestException(`Saldo E-Wallet tidak mencukupi (Tersedia: Rp ${Number(wallet.balance).toLocaleString('id-ID')})`);
    }

    // Check daily/weekly spending limits for mobile orders too
    await this.checkSpendingLimits(
      wallet.id, total,
      wallet.daily_spending_limit,
      wallet.weekly_spending_limit,
    );

    return this.prisma.posOrder.create({
      data: {
        tenant_uuid: tenantUuid,
        outlet_id: dto.outlet_id,
        order_no: orderNo,
        order_type: 'mobile_order',
        student_id: dto.student_id,
        cashier_id: userId, // The wali santri user acts as the "cashier" who initiated the order
        subtotal: new Prisma.Decimal(subtotal),
        total: new Prisma.Decimal(total),
        payment_method: dto.payment_method || 'wallet',
        status: 'pending',
        notes: dto.notes,
        items: {
          create: orderItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            cost_price: item.cost_price,
            subtotal: new Prisma.Decimal(item.subtotal)
          }))
        }
      },
      include: { items: true }
    });
  }
}
