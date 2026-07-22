import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ValidateCredentialsDto {
  @ApiProperty({ example: 'admin@kiichpam.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ContraseñaSegura123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
