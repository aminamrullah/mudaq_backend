import { IsString, IsOptional, IsNumber, IsBoolean, IsInt, IsArray, IsUUID, Min, ValidateNested, ArrayMinSize, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Outlet ──────────────────────────────────────────────────
export class CreateOutletDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}
export class UpdateOutletDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

export class CreateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() outlet_id?: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sort_order?: number;
}
export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sort_order?: number;
}

// ─── Unit ────────────────────────────────────────────────────
export class CreateUnitDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() outlet_id?: string;
  @ApiProperty() @IsString() name: string;
}
export class UpdateUnitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
}

// ─── Product ─────────────────────────────────────────────────
export class CreateProductDto {
  @ApiProperty() @IsUUID() outlet_id: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() category_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() @Min(0) price: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) cost_price?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() margin_percent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) min_stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() image_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unit_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier_phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() track_stock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}
export class UpdateProductDto extends CreateProductDto {}

// ─── Stock ───────────────────────────────────────────────────
export class StockInDto {
  @ApiProperty() @IsUUID() outlet_id: string;
  @ApiProperty() @IsUUID() product_id: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) cost_price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() supplier_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateOpnameDto {
  @ApiProperty() @IsUUID() outlet_id: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class OpnameItemDto {
  @ApiProperty() @IsUUID() product_id: string;
  @ApiProperty() @IsInt() actual_stock: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteOpnameDto {
  @ApiProperty() @IsUUID() opname_id: string;
  @ApiProperty({ type: [OpnameItemDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OpnameItemDto)
  items: OpnameItemDto[];
}

// ─── Promotion ───────────────────────────────────────────────
export class CreatePromotionDto {
  @ApiProperty() @IsUUID() outlet_id: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() discount_type: string; // percentage, fixed_amount
  @ApiProperty() @IsNumber() @Min(0) discount_value: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) min_purchase?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) max_discount?: number;
  @ApiProperty() @IsString() apply_to: string; // all, selected_products
  @ApiProperty() @IsDateString() start_date: string;
  @ApiProperty() @IsDateString() end_date: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() usage_limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) product_ids?: string[];
}

// ─── POS ─────────────────────────────────────────────────────
export class OpenSessionDto {
  @ApiProperty() @IsUUID() outlet_id: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) opening_balance?: number;
}
export class CloseSessionDto {
  @ApiProperty() @IsUUID() session_id: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() closing_balance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CartItemDto {
  @ApiProperty() @IsUUID() product_id: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
}

export class CheckoutDto {
  @ApiProperty()
  @IsUUID()
  outlet_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  order_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  session_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  student_id?: string;

  @ApiProperty()
  @IsString()
  payment_method: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  promo_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bill_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  topup_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  withdrawal_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items?: CartItemDto[];
}

export class UpdateOrderStatusDto {
  @ApiProperty()
  @IsString()
  status: string; // confirmed, ready, completed, cancelled

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
