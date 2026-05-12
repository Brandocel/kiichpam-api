import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class HeroSlideLanguageDto {
  @ApiProperty({ example: 'es' })
  @IsString()
  lang: string;

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