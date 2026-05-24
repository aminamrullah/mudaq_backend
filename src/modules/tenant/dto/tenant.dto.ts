import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
  IsNumber,
  IsBoolean,
  ValidateIf,
  IsDateString,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Pesantren Darul Hikmah' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'darul-hikmah' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((o, v) => v !== '' && v !== null)
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  max_students?: number;

  @IsOptional()
  @IsString()
  admin_name?: string;

  @IsOptional()
  @ValidateIf((o, v) => v !== '' && v !== null)
  @IsEmail()
  admin_email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  admin_password?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subscription_status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  billing_cycle?: string;

  @ApiProperty({ required: false, default: 14 })
  @IsOptional()
  @IsNumber()
  trial_duration_days?: number;

  @IsOptional()
  @IsString()
  xendit_sub_account_id?: string;

  @IsOptional()
  @IsNumber()
  platform_fee?: number;

  @IsOptional()
  @IsNumber()
  surcharge_fee?: number;

  @IsOptional()
  @IsNumber()
  qris_platform_fee?: number;

  @IsOptional()
  @IsNumber()
  qris_surcharge_fee?: number;

  @IsOptional()
  @IsBoolean()
  qris_fee_is_percent?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  manual_topup_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  price_per_student?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  billing_day?: number;

  @ApiProperty({ required: false, example: 'per_student' })
  @IsOptional()
  @IsString()
  billing_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  fixed_billing_amount?: number;

  @ApiProperty({ required: false, example: 'gregorian' })
  @IsOptional()
  @IsString()
  calendar_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  letterhead?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, example: 'MODERN' })
  @IsString()
  @IsOptional()
  landing_page_template?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  can_manage_landing_page?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  landing_page_config?: any;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  addon_koperasi?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  addon_wa_gateway?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  addon_landing_page?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  addon_inventaris?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  expired_at?: string | Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  storage_limit?: number;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  xendit_sub_account_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  platform_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  surcharge_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  qris_platform_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  qris_surcharge_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  qris_fee_is_percent?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  manual_topup_fee?: number;
}
