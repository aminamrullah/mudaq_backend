import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TopupDto {
  @ApiProperty() @IsNotEmpty() @IsString() wallet_id: string;
  @ApiProperty({ minimum: 10000 })
  @IsNotEmpty()
  @IsNumber()
  @Min(10000, { message: 'Minimum top-up Rp 10.000' })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  payment_channel?: string;

  @ApiProperty({ required: false, enum: ['cash', 'tenant_float'] })
  @IsOptional()
  @IsIn(['cash', 'tenant_float'])
  source?: 'cash' | 'tenant_float';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class TransferDto {
  @ApiProperty() @IsNotEmpty() @IsString() from_wallet_id: string;
  @ApiProperty() @IsNotEmpty() @IsString() to_wallet_id: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() @Min(1000) amount: number;
  @ApiProperty() @IsNotEmpty() @IsString() pin: string;
}

export class UpdatePinDto {
  @ApiProperty() @IsNotEmpty() @IsString() wallet_id: string;
  @ApiProperty() @IsNotEmpty() @IsString() new_pin: string;
  @ApiProperty() @IsOptional() @IsString() old_pin?: string;
}

export class PayWithWalletDto {
  @ApiProperty() @IsNotEmpty() @IsString() wallet_id: string;
  @ApiProperty() @IsNotEmpty() @IsString() bill_id: string;
  @ApiProperty() @IsNotEmpty() @IsNumber() @Min(1) amount: number;
  @ApiProperty() @IsNotEmpty() @IsString() pin: string;
}
