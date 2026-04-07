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

  @ApiPropertyOptional({ enum: CampaignCategoryDto, example: 'MIXED' })
  @IsOptional()
  @IsEnum(CampaignCategoryDto)
  category?: CampaignCategoryDto;

  @ApiPropertyOptional({ enum: CampaignRuleTypeDto, example: 'PERCENT_DISCOUNT' })
  @IsOptional()
  @IsEnum(CampaignRuleTypeDto)
  ruleType?: CampaignRuleTypeDto;

  @ApiPropertyOptional({ enum: CampaignAudienceDto, example: 'ALL' })
  @IsOptional()
  @IsEnum(CampaignAudienceDto)
  audience?: CampaignAudienceDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedAdultPriceMXN?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedChildPriceMXN?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fixedInfantPriceMXN?: number;

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