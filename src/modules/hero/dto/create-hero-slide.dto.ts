import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { HeroSlideLanguageDto } from './hero-slide-language.dto';

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

  @ApiPropertyOptional({ example: '/paquetes' })
  @IsOptional()
  @IsString()
  linkUrl?: string | null;

  /**
   * Campos legacy.
   * Se mantienen para compatibilidad.
   * Si no mandas translations, estos campos se guardan como traducción "es".
   */
  @ApiPropertyOptional({ example: 'El lugar de los sueños' })
  @IsOptional()
  @IsString()
  title?: string | null;

  @ApiPropertyOptional({
    example: 'Un refugio donde la naturaleza y la familia se unen en perfecta armonía',
  })
  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @ApiPropertyOptional({ example: 'Ver paquetes' })
  @IsOptional()
  @IsString()
  linkText?: string | null;

  @ApiPropertyOptional({ example: 'Pareja en bici' })
  @IsOptional()
  @IsString()
  altText?: string | null;

  @ApiPropertyOptional({
    type: [HeroSlideLanguageDto],
    example: [
      {
        lang: 'es',
        title: 'El lugar de los sueños',
        subtitle: 'Un refugio donde la naturaleza y la familia se unen en perfecta armonía',
        linkText: 'Ver paquetes',
        altText: 'Pareja en bici',
      },
      {
        lang: 'en',
        title: 'The place of dreams',
        subtitle: 'A refuge where nature and family come together in perfect harmony',
        linkText: 'View packages',
        altText: 'Couple riding bikes',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeroSlideLanguageDto)
  translations?: HeroSlideLanguageDto[];
}