import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateHeroSlideDto {
  @ApiProperty({ example: 'uuid-del-mediaasset' })
  @IsString()
  mediaId: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'El lugar de los sueños' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Un refugio donde...' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ example: '/paquetes' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional({ example: 'Ver paquetes' })
  @IsOptional()
  @IsString()
  linkText?: string;

  @ApiPropertyOptional({ example: 'Pareja en bici' })
  @IsOptional()
  @IsString()
  altText?: string;
}
