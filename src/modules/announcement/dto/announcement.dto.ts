import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Update Sistem' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Terdapat update sistem besok pagi.' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  target_all?: boolean;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsOptional()
  target_tenant_uuids?: string[];
}

export class UpdateAnnouncementDto {
  @ApiProperty({ example: 'Update Sistem' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'Terdapat update sistem besok pagi.' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  target_all?: boolean;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @IsOptional()
  target_tenant_uuids?: string[];
}
