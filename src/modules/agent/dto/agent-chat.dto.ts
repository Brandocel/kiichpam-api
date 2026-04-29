import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsIn(['whatsapp', 'web'])
  channel: 'whatsapp' | 'web';

  @IsOptional()
  @IsString()
  @IsIn(['es', 'en'])
  lang?: 'es' | 'en';
}