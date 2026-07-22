import { ApiProperty } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Auditoría' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'auditoria@kiichpam.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ContraseñaSegura123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: AdminRole, example: AdminRole.AUDITOR })
  @IsEnum(AdminRole)
  role: AdminRole;
}
