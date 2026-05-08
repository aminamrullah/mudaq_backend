import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsArray,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateFeeCategoryDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty({ enum: ['monthly', 'yearly', 'once', 'donation'] })
  @IsString()
  type: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() amount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() due_day?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() image_url?: string;
  @ApiProperty({ required: false }) @IsOptional() is_active?: boolean;
}

export class UpdateFeeCategoryDto extends PartialType(CreateFeeCategoryDto) {}

export class GenerateBillsDto {
  @ApiProperty() @IsNotEmpty() @IsString() fee_category_id: string;
  @ApiProperty() @IsNotEmpty() @IsString() period: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() due_date: string;
  @ApiProperty({ required: false, description: 'Empty = all active students' })
  @IsOptional()
  @IsArray()
  student_ids?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() classroom_id?: string;
  @ApiProperty({ required: false, enum: ['all', 'classroom', 'student'] })
  @IsOptional()
  @IsString()
  target_type?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dormitory_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dormitory_room_id?: string;
}

export class RecordPaymentDto {
  @ApiProperty() @IsNotEmpty() @IsString() bill_id: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() amount: number;
  @ApiProperty({ enum: ['cash', 'transfer', 'payment_gateway', 'saldo_santri'] })
  @IsString()
  payment_method: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() pin?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() payment_channel?: string;
}

export class RecordDonationDto {
  @ApiProperty() @IsNotEmpty() @IsString() student_id: string;
  @ApiProperty() @IsNotEmpty() @IsString() fee_category_id: string; // The donation campaign
  @ApiProperty() @IsNotEmpty() @IsNumber() amount: number;
  @ApiProperty({ enum: ['cash', 'transfer', 'payment_gateway', 'saldo_santri'] })
  @IsString()
  payment_method: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() pin?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() payment_channel?: string;
}

export class RecordDisbursementDto {
  @ApiProperty() @IsNotEmpty() @IsString() fee_category_id: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() amount: number;
  @ApiProperty() @IsNotEmpty() @IsString() recipient: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}
