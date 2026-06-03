import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateEducationUnitDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  headmaster?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateEducationUnitDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  headmaster?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
