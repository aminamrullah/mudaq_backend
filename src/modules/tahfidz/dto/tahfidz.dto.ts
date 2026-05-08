import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';

export class CreateTahfidzRecordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  student_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  teacher_id?: string;

  @ApiProperty({ enum: ['QURAN', 'NADHOM'] })
  @IsEnum(['QURAN', 'NADHOM'])
  category: string;

  @ApiProperty({ description: 'Surah Name or Kitab Name' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Ayah From or Bait From' })
  @IsNumber()
  @IsOptional()
  from?: number;

  @ApiPropertyOptional({ description: 'Ayah To or Bait To' })
  @IsNumber()
  @IsOptional()
  to?: number;

  @ApiPropertyOptional({ description: 'Juz (Quran only)' })
  @IsNumber()
  @IsOptional()
  juz?: number;

  @ApiPropertyOptional({ enum: ['setoran', 'murajaah'] })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ enum: ['lancar', 'tidak_lancar'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTahfidzRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
