import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesAgentType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateSalesAgentDto {
  @ApiProperty({ example: 'María López' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'MARIA-LOPEZ',
    description:
      'Código del link de venta. Si se omite, se genera a partir del nombre.',
  })
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

  @ApiPropertyOptional({
    enum: SalesAgentType,
    example: SalesAgentType.HOTEL,
  })
  @IsOptional()
  @IsEnum(SalesAgentType)
  type?: SalesAgentType;

  @ApiPropertyOptional({
    example: 10,
    description: 'Porcentaje de comisión sobre el total de la reservación.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ example: 'Contacto en recepción, turno matutino.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
