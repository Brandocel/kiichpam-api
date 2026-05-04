import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContactMessageDto {
  @ApiProperty({ example: 'Brando Antonio' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'cliente@email.com' })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiPropertyOptional({ example: '+52 998 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'México' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiProperty({
    example: 'reservations',
    enum: ['general', 'reservations', 'events', 'promotions', 'support'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['general', 'reservations', 'events', 'promotions', 'support'])
  subjectType?: string;

  @ApiPropertyOptional({ example: 'Quiero información sobre paquetes' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  @ApiProperty({
    example: 'Hola, quiero más información sobre los paquetes de Kiichpam.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ example: 'es' })
  @IsOptional()
  @IsString()
  @IsIn(['es', 'en'])
  lang?: 'es' | 'en';
}