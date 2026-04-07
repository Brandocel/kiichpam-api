import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum CampaignEffectModeDto {
  MERGE = 'MERGE',
  REPLACE = 'REPLACE',
}

export class CampaignTranslationDto {
  @ApiPropertyOptional({ example: 'es' })
  @IsString()
  lang!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promoName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promoDescription?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  addIncludes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  removeIncludes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  addExcludes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  removeExcludes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  addNotes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  removeNotes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  imageMediaId?: string;

  @ApiPropertyOptional({ enum: CampaignEffectModeDto, example: 'MERGE' })
  @IsOptional()
  @IsEnum(CampaignEffectModeDto)
  effectMode?: CampaignEffectModeDto;
}