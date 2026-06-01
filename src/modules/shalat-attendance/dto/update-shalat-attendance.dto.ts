import { IsString, IsOptional } from 'class-validator';

export class UpdateShalatAttendanceDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
