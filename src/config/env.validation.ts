import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvVars {
  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @IsOptional()
  PORT?: string;

  @IsString()
  @IsOptional()
  APP_URL?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  /**
   * Seguridad para integraciones externas.
   * Estas credenciales se pueden enviar de dos formas:
   *
   * 1. Headers:
   *    x-api-key: API_CLIENT_KEY
   *    x-api-secret: API_CLIENT_SECRET
   *
   * 2. Basic Auth:
   *    Username: API_CLIENT_KEY
   *    Password: API_CLIENT_SECRET
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  API_CLIENT_KEY!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  API_CLIENT_SECRET!: string;

  /**
   * Seguridad para Swagger.
   * Esto protege /docs para que no quede público.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  SWAGGER_USER!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  SWAGGER_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_TOKEN!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_PHONE_NUMBER_ID!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_BUSINESS_ACCOUNT_ID!: string;

  @IsString()
  @IsOptional()
  WHATSAPP_API_VERSION?: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_VERIFY_TOKEN!: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `ENV validation error:\n${errors
        .map((error) => JSON.stringify(error.constraints))
        .join('\n')}`,
    );
  }

  return validated;
}