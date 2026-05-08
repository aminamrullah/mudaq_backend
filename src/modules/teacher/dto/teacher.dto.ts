import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateTeacherDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() nip?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() nik?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  birth_place?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  birth_date?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  stay_type?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_tahfidz_teacher?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() user_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() password?: string;
  @ApiProperty({ required: false }) @IsOptional() base_salary?: number;
}

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {}
