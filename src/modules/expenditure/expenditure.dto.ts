import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateExpenditureDto {
  @ApiProperty() @IsNotEmpty() @IsString() title: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() amount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() date?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() payment_method?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() attachment_url?: string;
}

export class UpdateExpenditureDto extends PartialType(CreateExpenditureDto) {}
