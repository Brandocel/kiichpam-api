import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Min,
  } from 'class-validator';
  import { PromotionSectionType } from '@prisma/client';
  
  export class CreatePromotionDto {
    @IsString()
    code: string;
  
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
  
    @IsOptional()
    @IsEnum(PromotionSectionType)
    sectionType?: PromotionSectionType;
  
    @IsString()
    title: string;
  
    @IsOptional()
    @IsString()
    subtitle?: string;
  
    @IsOptional()
    @IsString()
    description?: string;
  
    @IsOptional()
    @IsString()
    buttonText?: string;
  
    @IsOptional()
    @IsString()
    buttonUrl?: string;
  
    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number;
  
    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;
  
    @IsOptional()
    @IsDateString()
    startAt?: string;
  
    @IsOptional()
    @IsDateString()
    endAt?: string;
  
    @IsOptional()
    @IsString()
    packageId?: string;
  
    @IsOptional()
    @IsString()
    campaignId?: string;
  
    @IsOptional()
    @IsString()
    imageMediaId?: string;
  }