import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QuoteCampaignDto {
  @IsString()
  packageCode: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  infants?: number;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  quoteAt?: string;

  @ApiPropertyOptional({
    example: 'AMOR-MAS-NATURAL-3X2',
  })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}