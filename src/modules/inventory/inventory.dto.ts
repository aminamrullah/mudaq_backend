import { IsNotEmpty, IsOptional, IsString, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateInventoryCategoryDto {
  @ApiProperty({ example: 'Elektronik' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Peralatan elektronik kantor dan belajar', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateInventoryCategoryDto extends PartialType(CreateInventoryCategoryDto) {}

export class CreateInventoryLocationDto {
  @ApiProperty({ example: 'Asrama A - Kamar 01' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Lantai 1 Gedung Asrama A', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateInventoryLocationDto extends PartialType(CreateInventoryLocationDto) {}

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Proyektor Epson EB-X400' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'PRJ-EPS-001', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location_id?: string;

  @ApiProperty({ example: 'Proyektor ruang rapat utama', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 'baik', description: 'baik, rusak_ringan, rusak_berat' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiProperty({ example: '2026-05-21', required: false })
  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @ApiProperty({ example: 6500000, required: false })
  @IsOptional()
  @IsNumber()
  purchase_price?: number;

  @ApiProperty({ example: 'dana bos', required: false })
  @IsOptional()
  @IsString()
  source_of_funds?: string;
}

export class UpdateInventoryItemDto extends PartialType(CreateInventoryItemDto) {}

export class CreateInventoryMutationDto {
  @ApiProperty({ example: 'move', description: 'in, out, move, condition_change' })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ example: 1 })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  from_location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  to_location?: string;

  @ApiProperty({ example: 'Dipindahkan ke Kamar Asrama B' })
  @IsOptional()
  @IsString()
  description?: string;
}
