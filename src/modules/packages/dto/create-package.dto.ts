import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class PackageTranslationDto {
  @ApiProperty({ example: 'es', enum: ['es', 'en'] })
  @IsIn(['es', 'en'])
  lang: 'es' | 'en';

  @ApiProperty({ example: 'Aventura KX BÁSICO' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Descripción corta del paquete...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: [
      'Ceremonia de Bienvenida.',
      'Acceso a Cenote Yun Chen.',
      'Chaleco salvavidas.',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includes?: string[];

  @ApiPropertyOptional({
    example: ['Servicio de buffet.', 'Bebidas.'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludes?: string[];

  @ApiPropertyOptional({
    example: [
      'Uso obligatorio de chaleco salvavidas.',
      'No incluye servicio de buffet ni bebidas.',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notes?: string[];
}

class AgeRulesDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(0)
  adultMin: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  childMin: number;

  @ApiProperty({ example: 11 })
  @IsInt()
  @Min(0)
  childMax: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(0)
  infantMax: number;
}

class ExtraTranslationDto {
  @ApiProperty({ example: 'es', enum: ['es', 'en'] })
  @IsIn(['es', 'en'])
  lang: 'es' | 'en';

  @ApiProperty({ example: 'Buffet' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Comida tipo buffet (no incluye bebidas)' })
  @IsOptional()
  @IsString()
  description?: string;
}

class CreateExtraDto {
  @ApiProperty({ example: 'BUFFET' })
  @IsString()
  code: string;

  @ApiProperty({ example: 15000, description: 'centavos => $150.00' })
  @IsInt()
  @Min(0)
  priceMXN: number;

  @ApiPropertyOptional({ example: 'MXN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ type: [ExtraTranslationDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExtraTranslationDto)
  translations?: ExtraTranslationDto[];
}

export class CreatePackageDto {
  @ApiProperty({ example: 'KX_BASIC' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 14900, description: 'centavos => $149.00' })
  @IsInt()
  @Min(0)
  adultPriceMXN: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  childPriceMXN?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  infantPriceMXN?: number;

  @ApiPropertyOptional({ example: 'MXN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxAdults?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxChildren?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxInfants?: number;

  @ApiPropertyOptional({ type: AgeRulesDto })
  @IsOptional()
  @IsObject()
  ageRules?: AgeRulesDto;

  @ApiPropertyOptional({ type: [PackageTranslationDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PackageTranslationDto)
  translations?: PackageTranslationDto[];

  @ApiPropertyOptional({ type: [CreateExtraDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateExtraDto)
  extras?: CreateExtraDto[];
}

