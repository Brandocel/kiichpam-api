import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'PROMO10' })
  @IsString()
  couponCode: string;

  @ApiProperty({ example: 20000 })
  @IsInt()
  @Min(0)
  subtotalMXN: number;

  @ApiPropertyOptional({ example: 'KX_BASIC' })
  @IsOptional()
  @IsString()
  packageCode?: string;

  @ApiPropertyOptional({ example: 'FB-ENERO-2026' })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}