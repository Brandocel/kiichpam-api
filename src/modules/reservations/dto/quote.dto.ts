import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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

  // cupón
  @ApiPropertyOptional({ example: 'PROMO10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  // campaign
  @ApiPropertyOptional({ example: 'FB-ENERO' })
  @IsOptional()
  @IsString()
  campaignCode?: string;

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

  // idioma para snapshot (es/en)
  @ApiPropertyOptional({ example: 'es' })
  @IsOptional()
  @IsString()
  lang?: string;

  // ✅ extras seleccionados
  @ApiPropertyOptional({ type: [SelectedExtraDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedExtraDto)
  extras?: SelectedExtraDto[];
}
