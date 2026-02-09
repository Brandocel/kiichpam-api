import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ example: 'PROMO10' })
  @IsString()
  code: string;

  // "PERCENT" o "FIXED"
  @ApiProperty({ example: 'PERCENT', enum: ['PERCENT', 'FIXED'] })
  @IsString()
  type: 'PERCENT' | 'FIXED';

  // si PERCENT => 10 (10%), si FIXED => 5000 (=$50.00)
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  value: number;

  @ApiProperty({ example: 'ALL', enum: ['ALL', 'PACKAGE_ONLY', 'CAMPAIGN_ONLY'] })
  @IsString()
  scope: 'ALL' | 'PACKAGE_ONLY' | 'CAMPAIGN_ONLY';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Opcionales: fechas, uso máximo, restricción por package/campaign
  @ApiPropertyOptional({ example: '2026-02-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  endsAt?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ example: 'AVENTURA_KX_PLUS' })
  @IsOptional()
  @IsString()
  packageCode?: string;

  @ApiPropertyOptional({ example: 'FB-ENERO-2026' })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}
