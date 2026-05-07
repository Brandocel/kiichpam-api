import {
    CanActivate,
    ExecutionContext,
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
  } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { Request } from 'express';
  import { timingSafeEqual } from 'crypto';
  
  type IntegrationCredentials = {
    key: string;
    secret: string;
  };
  
  @Injectable()
  export class IntegrationApiKeyGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) {}
  
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
  
      const expectedKey = this.configService.get<string>('integrationAuth.clientKey');
      const expectedSecret = this.configService.get<string>('integrationAuth.clientSecret');
  
      if (!expectedKey || !expectedSecret) {
        throw new InternalServerErrorException(
          'La seguridad de integración no está configurada correctamente.',
        );
      }
  
      const credentials = this.getCredentials(request);
  
      if (!credentials) {
        throw new UnauthorizedException(
          'Credenciales requeridas. Usa Basic Auth o los headers x-api-key y x-api-secret.',
        );
      }
  
      const isValidKey = safeCompare(credentials.key, expectedKey);
      const isValidSecret = safeCompare(credentials.secret, expectedSecret);
  
      if (!isValidKey || !isValidSecret) {
        throw new UnauthorizedException('Credenciales inválidas.');
      }
  
      return true;
    }
  
    private getCredentials(request: Request): IntegrationCredentials | null {
      const apiKey = getHeaderValue(request.headers['x-api-key']);
      const apiSecret = getHeaderValue(request.headers['x-api-secret']);
  
      if (apiKey && apiSecret) {
        return {
          key: apiKey,
          secret: apiSecret,
        };
      }
  
      const authorization = getHeaderValue(request.headers.authorization);
  
      if (!authorization || !authorization.startsWith('Basic ')) {
        return null;
      }
  
      const encodedCredentials = authorization.replace('Basic ', '').trim();
  
      try {
        const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
  
        const separatorIndex = decodedCredentials.indexOf(':');
  
        if (separatorIndex === -1) {
          return null;
        }
  
        const key = decodedCredentials.slice(0, separatorIndex);
        const secret = decodedCredentials.slice(separatorIndex + 1);
  
        if (!key || !secret) {
          return null;
        }
  
        return {
          key,
          secret,
        };
      } catch {
        return null;
      }
    }
  }
  
  function getHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
  
    return value;
  }
  
  function safeCompare(value: string, expectedValue: string): boolean {
    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expectedValue);
  
    if (valueBuffer.length !== expectedBuffer.length) {
      return false;
    }
  
    return timingSafeEqual(valueBuffer, expectedBuffer);
  }