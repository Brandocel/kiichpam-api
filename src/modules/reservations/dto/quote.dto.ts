import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SelectedExtraDto {
  @ApiProperty({ example: 'BUFFET' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class QuoteDto {
  @ApiProperty({ example: 'KX_BASIC' })
  @IsString()
  packageCode: string;

  @ApiProperty({ example: '2026-02-01T10:00:00.000Z' })
  @IsDateString()
  visitDate: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  adults: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  children: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  infants: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  inapamVisitors?: number;

  @ApiPropertyOptional({ example: 'PROMO10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 'SS-KX-2026' })
  @IsOptional()
  @IsString()
  campaignCode?: string;

  @ApiPropertyOptional({
    example: 'Facebook',
    description:
      'Referencia/origen de la reservación: Facebook, Instagram, TikTok, WhatsApp, Directo, Agencias, Taxis, Hotel o Pagina WEB',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fbclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ttclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gclid?: string;

  @ApiPropertyOptional({
    example:
      'https://kiichpamxunaan.com/es?utm_source=facebook&utm_medium=cpc&fbclid=IwAR...',
    description:
      'URL completa de aterrizaje con la que llegó el visitante (evidencia de rastreo)',
  })
  @IsOptional()
  @IsString()
  landingPage?: string;

  @ApiPropertyOptional({
    example: 'https://www.google.com/',
    description: 'document.referrer del navegador al capturar la atribución',
  })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional({
    example: 'MARIA-LOPEZ',
    description:
      'Código del agente de reservas que trajo la venta (param `ag` del link). Es una dimensión aparte del canal: no reemplaza reference ni utmSource.',
  })
  @IsOptional()
  @IsString()
  agentCode?: string;

  /*
   * Datos de contacto opcionales.
   *
   * La web los manda al crear la reservación para que no queden folios
   * huérfanos: antes se creaba el borrador en el paso del paquete y, si el
   * visitante abandonaba, quedaba una reservación sin nombre ni correo.
   * Siguen siendo opcionales porque /quote usa este mismo DTO.
   */
  @ApiPropertyOptional({ example: 'María' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'López' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'maria@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '9981234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'México' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Llegamos temprano' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ example: 'es' })
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional({ type: [SelectedExtraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedExtraDto)
  extras?: SelectedExtraDto[];
}

export type NormalizedQuoteDto = QuoteDto & {
  normalizedPackageCode?: string;
  normalizedCampaignCode?: string;
  normalizedCouponCode?: string;
  normalizedLang?: 'es' | 'en';
};