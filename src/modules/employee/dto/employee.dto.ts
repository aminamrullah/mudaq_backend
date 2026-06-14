import { IsNotEmpty, IsOptional, IsString, IsDateString, IsUUID, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------- WORK SCHEDULE DTO ----------------
export class CreateWorkScheduleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @ApiProperty({ example: '07:00' })
  @IsString()
  @IsNotEmpty()
  check_in_start: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @IsNotEmpty()
  check_in_end: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @IsNotEmpty()
  check_out_start: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @IsNotEmpty()
  check_out_end: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  max_radius_meters?: number;
}

export class UpdateWorkScheduleDto extends CreateWorkScheduleDto {}


// ---------------- ATTENDANCE DTO ----------------
export class EmployeeCheckInDto {
  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image_base64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class EmployeeCheckOutDto extends EmployeeCheckInDto {}


// ---------------- PERMISSION DTO ----------------
export class EmployeePermissionDto {
  @ApiProperty({ description: 'sakit, cuti_tahunan, cuti_melahirkan, izin_lain' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class TeachingPermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schedule_id?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

// ---------------- OVERTIME DTO ----------------
export class OvertimeRequestDto {
  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_time: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_time: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApprovalDto {
  @ApiProperty({ description: 'approved, rejected' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
