import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'general' })
  @IsString()
  @IsNotEmpty()
  category: string; // general, technical

  @ApiProperty({ example: 'medium' })
  @IsString()
  @IsOptional()
  priority?: string; // low, medium, high, urgent
}

export class CreateTicketMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  attachment_url?: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ example: 'in_progress' })
  @IsString()
  @IsNotEmpty()
  status: string; // open, in_progress, resolved, closed
}
