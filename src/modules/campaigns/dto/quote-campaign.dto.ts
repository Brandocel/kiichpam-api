import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QuoteCampaignDto {
  @ApiProperty({ example: 'KX-PLUS' })
  @IsString()
  packageCode!: string;

  @ApiPropertyOptional({ example: 'es' })
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  adults?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  infants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  quoteAt?: string;
}