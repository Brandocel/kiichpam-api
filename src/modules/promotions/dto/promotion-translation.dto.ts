import { IsOptional, IsString } from 'class-validator';

export class PromotionTranslationDto {
  @IsString()
  lang: string;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  buttonText?: string | null;
}