import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() nis?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() nisn?: string;
  @ApiProperty() @IsNotEmpty() @IsString() nik: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() gender?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  birth_place?: string;
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  birth_date: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() photo?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  father_name?: string;
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  mother_name: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parent_phone?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parent_email?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  classroom_id?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dormitory_id?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dormitory_room_id?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  academic_year_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() tahfidz_teacher_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() quran_teacher_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() kitab_teacher_id?: string;
  @ApiProperty({ required: false }) @IsOptional() entry_year?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() graduation_date?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() unit_id?: string;

  // Fisik & Pendidikan
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  last_education?: string;
  @ApiProperty({ required: false }) @IsOptional() weight?: number;
  @ApiProperty({ required: false }) @IsOptional() height?: number;

  // Data Orang Tua Tambahan
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  father_job?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  father_address?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mother_job?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mother_address?: string;

  // Alamat Detil
  @ApiProperty({ required: false }) @IsOptional() @IsString() country?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() province?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() district?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() village?: string;

  // Dokumen
  @ApiProperty({ required: false }) @IsOptional() @IsString() file_kk?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  file_ijazah?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  file_akta?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  file_others?: string;

}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class BulkMutateStudentDto {
  @ApiProperty() @IsNotEmpty() @IsArray() student_ids: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() classroom_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dormitory_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dormitory_room_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() academic_year_id?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}
