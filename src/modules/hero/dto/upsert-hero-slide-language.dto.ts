import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpsertHeroSlideLanguageDto {
  @ApiPropertyOptional({ example: 'The place of dreams' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiPropertyOptional({
    example: 'A refuge where nature and family come together in perfect harmony',
  })
  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @ApiPropertyOptional({ example: 'View packages' })
  @IsOptional()
  @IsString()
  linkText?: string | null;

  @ApiPropertyOptional({ example: 'Couple riding bikes' })
  @IsOptional()
  @IsString()
  altText?: string | null;
}