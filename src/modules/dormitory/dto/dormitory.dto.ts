import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateDormitoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mushrif_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class UpdateDormitoryDto extends PartialType(CreateDormitoryDto) {}

export class CreateRoomDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
