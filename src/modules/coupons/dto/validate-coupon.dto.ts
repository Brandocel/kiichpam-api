import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'PROMO10' })
  @IsString()
  couponCode: string;

  @ApiPropertyOptional({ example: 'AVENTURA_KX_PLUS' })
  @IsOptional()
  @IsString()
  packageCode?: string;

  @ApiPropertyOptional({ example: 'FB-ENERO-2026' })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}
