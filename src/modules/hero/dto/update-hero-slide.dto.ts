import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateHeroSlideDto {
  @ApiPropertyOptional({ example: 'uuid-del-mediaasset' })
  @IsOptional()
  @IsString()
  mediaId?: string;

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
   * Si quieres actualizar idiomas, usa:
   * PATCH /hero/slides/:id/languages/:lang
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
}