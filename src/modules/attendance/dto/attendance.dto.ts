import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateAttendanceDto {
  @ApiProperty() @IsNotEmpty() @IsString() student_id: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  schedule_id?: string;
  @ApiProperty() @IsNotEmpty() @IsDateString() date: string;
  @ApiProperty({ enum: ['hadir', 'izin', 'sakit', 'alpha'] })
  @IsNotEmpty()
  @IsString()
  status: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

class BulkItem {
  @IsNotEmpty() @IsString() student_id: string;
  @IsNotEmpty() @IsString() status: string;
  @IsOptional() @IsString() notes?: string;
}

export class BulkAttendanceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  schedule_id?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teacher_status?: string;

  @ApiProperty() @IsNotEmpty() @IsDateString() date: string;
  @ApiProperty({ type: [BulkItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkItem)
  items: BulkItem[];
}
