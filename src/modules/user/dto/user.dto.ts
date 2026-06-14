import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsNotEmpty() @MinLength(6) password: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  base_salary?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  koperasi_outlet_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  unit_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rfid?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fingerprint_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  work_schedule_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  work_attendance_rate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  overtime_rate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_work_attendance_required?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}
