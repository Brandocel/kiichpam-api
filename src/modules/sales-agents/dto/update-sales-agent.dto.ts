import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalesAgentType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateSalesAgentDto {
  @ApiPropertyOptional({ example: 'María López' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'MARIA-LOPEZ' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'maria@hotelriviera.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '9981234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Hotel Riviera' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ enum: SalesAgentType })
  @IsOptional()
  @IsEnum(SalesAgentType)
  type?: SalesAgentType;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Contacto en recepción, turno matutino.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
