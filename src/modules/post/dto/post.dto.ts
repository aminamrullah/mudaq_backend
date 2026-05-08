import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  video_url?: string;

  @ApiProperty({ example: 'announcement', description: 'announcement, news, event, pengajian, kesantrian' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}

export class UpdatePostDto extends CreatePostDto {}
