import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignTranslationDto } from './campaign-translation.dto';

export enum CampaignRuleTypeDto {
  BASE_PRICE = 'BASE_PRICE',
  FIXED_PRICE = 'FIXED_PRICE',
  PERCENT_DISCOUNT = 'PERCENT_DISCOUNT',
  TWO_FOR_ONE = 'TWO_FOR_ONE',
  THREE_FOR_TWO = 'THREE_FOR_TWO',
}

export enum CampaignAudienceDto {
  ADULT = 'ADULT',
  CHILD = 'CHILD',
  INFANT = 'INFANT',
  ALL = 'ALL',
}

export enum CampaignCategoryDto {
  PRICE = 'PRICE',
  CONTENT = 'CONTENT',
  MIXED = 'MIXED',
}

export class CreateCampaignDto {
  @ApiProperty({ example: 'SS-KX-2026' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Semana Santa 2026' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiPropertyOptional({ enum: CampaignCategoryDto, example: 'PRICE' })
  @IsOptional()
  @IsEnum(CampaignCategoryDto)
  category?: CampaignCategoryDto;

  @ApiPropertyOptional({ enum: CampaignRuleTypeDto, example: 'FIXED_PRICE' })
  @IsOptional()
  @IsEnum(CampaignRuleTypeDto)
  ruleType?: CampaignRuleTypeDto;

  @ApiPropertyOptional({ enum: CampaignAudienceDto, example: 'ALL' })
  @IsOptional()
  @IsEnum(CampaignAudienceDto)
  audience?: CampaignAudienceDto;

  @ApiPropertyOptional({
    example: '2026-04-01T00:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({
    example: '2026-04-30T23:59:59.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional({
    example: 11900,
    description: 'Precio fijo adulto en centavos. Ejemplo: 11900 = $119.00',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedAdultPriceMXN?: number;

  @ApiPropertyOptional({
    example: 6900,
    description: 'Precio fijo niño en centavos. Ejemplo: 6900 = $69.00',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedChildPriceMXN?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Precio fijo infante en centavos. Ejemplo: 0 = $0.00',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedInfantPriceMXN?: number;

  @ApiPropertyOptional({
    example: 9900,
    description: 'Precio fijo INAPAM en centavos. Ejemplo: 9900 = $99.00',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedInapamPriceMXN?: number | null;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  payQty?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  takeQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minAdults?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minChildren?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minInfants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ type: [CampaignTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignTranslationDto)
  translations?: CampaignTranslationDto[];
}