import { IsNotEmpty, IsNumber, IsString, Min, IsOptional } from 'class-validator';

export class UserTopupDto {
  @IsNotEmpty()
  @IsString()
  wallet_id: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(10000)
  amount: number;

  @IsOptional()
  @IsString()
  payment_channel?: string;
}

export class UserWithdrawDto {
  @IsNotEmpty()
  @IsString()
  wallet_id: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(10000)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateUserPinDto {
  @IsNotEmpty()
  @IsString()
  wallet_id: string;

  @IsOptional()
  @IsString()
  old_pin?: string;

  @IsNotEmpty()
  @IsString()
  new_pin: string;
}
