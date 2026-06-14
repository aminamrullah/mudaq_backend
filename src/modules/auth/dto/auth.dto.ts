import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: '081234567890',
    description: 'Phone number or email',
  })
  @IsNotEmpty({ message: 'Login identifier harus diisi' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty({ message: 'Password harus diisi' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'admin', required: false })
  @IsOptional()
  @IsString()
  app_type?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Ahmad Fauzi' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'ahmad@pesantren.id' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '081234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password: string;

  @ApiProperty({ example: 'uuid-pesantren', required: false })
  @IsOptional()
  @IsString()
  tenant_uuid?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  refresh_token: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '081234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'admin@pesantren.id', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'uuid-pesantren', required: false })
  @IsOptional()
  @IsString()
  tenant_uuid?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '081234567890' })
  @IsNotEmpty({ message: 'Nomor HP harus diisi' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Kode OTP harus diisi' })
  @IsString()
  @MinLength(6, { message: 'Kode OTP minimal 6 digit' })
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: '081234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'admin@pesantren.id', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Kode OTP harus diisi' })
  @IsString()
  otp: string;

  @ApiProperty({ example: 'newpassword123' })
  @IsNotEmpty({ message: 'Password baru harus diisi' })
  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  new_password: string;
}

export class RegisterWalisantriDto {
  @ApiProperty({ example: 'Ahmad Fauzi', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: '081234567890' })
  @IsNotEmpty({ message: 'Nomor HP harus diisi' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty({ message: 'Password harus diisi' })
  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
  password: string;
}

export class LoginWalisantriDto {
  @ApiProperty({ example: '081234567890' })
  @IsNotEmpty({ message: 'Nomor HP harus diisi' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty({ message: 'Password harus diisi' })
  @IsString()
  password: string;
}

export class VerifyRegistrationOtpDto {
  @ApiProperty({ example: '081234567890' })
  @IsNotEmpty({ message: 'Nomor HP harus diisi' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Kode OTP harus diisi' })
  @IsString()
  @MinLength(6, { message: 'Kode OTP minimal 6 digit' })
  otp: string;
}
