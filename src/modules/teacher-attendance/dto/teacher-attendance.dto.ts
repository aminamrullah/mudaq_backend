import { IsNotEmpty, IsOptional, IsString, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeacherAttendanceDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  teacher_id: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  schedule_id?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'hadir, izin, sakit, alpha' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  check_in?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  check_out?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkTeacherAttendanceDto {
  @ApiProperty({ type: [CreateTeacherAttendanceDto] })
  @IsNotEmpty()
  data: CreateTeacherAttendanceDto[];
}
