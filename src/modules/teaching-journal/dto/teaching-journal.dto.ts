import { IsNotEmpty, IsOptional, IsString, IsDateString, IsUUID, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeachingJournalDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  teacher_id?: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  schedule_id: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  material: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  student_count?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTeachingJournalDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  material?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  student_count?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
