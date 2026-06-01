import { IsString, IsNotEmpty, IsDateString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ShalatAttendanceData {
  @IsString()
  @IsNotEmpty()
  student_id: string;

  @IsString()
  @IsNotEmpty()
  status: string; // jamaah, munfarid, izin, sakit, alpha, haid

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateShalatAttendanceDto {
  @IsString()
  @IsNotEmpty()
  shalat_name: string; // subuh, dzuhur, ashar, maghrib, isya, dhuha, tahajjud

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShalatAttendanceData)
  attendances: ShalatAttendanceData[];
}
