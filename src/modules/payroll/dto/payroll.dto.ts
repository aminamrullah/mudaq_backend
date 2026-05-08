import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PayrollItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() user_id: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() teacher_id?: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() base_salary: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  allowances?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  deductions?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

export class CreatePayrollDto {
  @ApiProperty({ example: '2026-05' }) @IsNotEmpty() @IsString() period: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [PayrollItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollItemDto)
  items?: PayrollItemDto[];
}

export class ApprovePayrollDto {
  @ApiProperty() @IsNotEmpty() @IsString() payroll_id: string;
}

export class GeneratePayrollDto {
  @ApiProperty({ example: '2026-05' }) @IsNotEmpty() @IsString() period: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
