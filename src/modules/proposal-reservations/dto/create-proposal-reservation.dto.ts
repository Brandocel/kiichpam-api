import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProposalReservationDto {
  @ApiProperty({
    example: 'fragancia-de-amor',
    description: 'Código del paquete de pedida de mano',
  })
  @IsString()
  @IsNotEmpty()
  packageCode: string;

  @ApiProperty({
    example: 'Brando Antonio Cel Anchez',
    description: 'Nombre completo del cliente',
  })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiPropertyOptional({
    example: 'Mili',
    description: 'Nombre de la pareja o persona para quien será la pedida',
  })
  @IsOptional()
  @IsString()
  partnerName?: string;

  @ApiProperty({
    example: 'correo@ejemplo.com',
    description: 'Correo del cliente',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '9981234567',
    description: 'Teléfono del cliente',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: '2026-04-20',
    description: 'Fecha de la pedida en formato YYYY-MM-DD',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reservationDate must be in YYYY-MM-DD format',
  })
  reservationDate: string;

  @ApiProperty({
    example: '18:00',
    description: 'Hora de inicio en formato HH:mm',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiProperty({
    example: '20:00',
    description: 'Hora de fin en formato HH:mm',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Número de asistentes',
    default: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  guests?: number;

  @ApiPropertyOptional({
    example: 'Quiero decoración especial con rosas blancas',
    description: 'Notas o comentarios adicionales',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}