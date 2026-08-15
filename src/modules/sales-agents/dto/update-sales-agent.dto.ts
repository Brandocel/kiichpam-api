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
  MinLength,
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

  /**
   * Alta o cambio de contraseña del panel. Si el agente todavía no tenía
   * cuenta, se le crea; si ya tenía, se le actualiza la contraseña.
   */
  @ApiPropertyOptional({ example: 'NuevaContraseña123', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  panelPassword?: string;

  /** Revoca el acceso al panel sin borrar al agente ni su historial. */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  panelAccessEnabled?: boolean;
}
