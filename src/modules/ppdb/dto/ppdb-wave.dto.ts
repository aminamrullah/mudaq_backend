import { IsString, IsNotEmpty, IsDateString, IsInt, IsBoolean, Min, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePpdbWaveDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  unit_ids?: string[];

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiProperty({ description: '0 means unlimited' })
  @IsInt()
  @Min(0)
  quota: number;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdatePpdbWaveDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  unit_ids?: string[];

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  start_date?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  end_date?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @IsOptional()
  quota?: number;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
