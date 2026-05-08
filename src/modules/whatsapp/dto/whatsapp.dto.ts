import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum WhatsappProvider {
  FONNTE = 'FONNTE',
  BAILEYS = 'BAILEYS',
}

export class UpdateWhatsappSettingsDto {
  @ApiProperty({ enum: WhatsappProvider })
  @IsEnum(WhatsappProvider)
  provider: WhatsappProvider;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fonnte_token?: string;
}
