import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;
}