import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class ScanRfidDto {
  @IsString()
  @IsNotEmpty()
  rfid: string;

  @IsString()
  @IsNotEmpty()
  shalat_name: string; // subuh, dzuhur, ashar, maghrib, isya

  @IsDateString()
  @IsOptional()
  date?: string; // Optional: defaults to today if not provided
}
