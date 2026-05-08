import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

type IntegrationCredentialsSource = 'headers' | 'basic-auth';

type IntegrationCredentials = {
  key: string;
  secret: string;
  source: IntegrationCredentialsSource;
};

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const expectedKey = this.configService.get<string>(
      'integrationAuth.clientKey',
    );

    const expectedSecret = this.configService.get<string>(
      'integrationAuth.clientSecret',
    );

    if (!expectedKey || !expectedSecret) {
      throw new InternalServerErrorException(
        'La seguridad de integración no está configurada correctamente.',
      );
    }

    const credentialCandidates = this.getCredentialCandidates(request);

    if (credentialCandidates.length === 0) {
      this.requestCredentials(response);

      throw new UnauthorizedException(
        'Credenciales requeridas. Usa Basic Auth o los headers x-api-key y x-api-secret.',
      );
    }

    const isAuthorized = credentialCandidates.some((credentials) => {
      const isValidKey = safeCompare(credentials.key, expectedKey);
      const isValidSecret = safeCompare(credentials.secret, expectedSecret);

      return isValidKey && isValidSecret;
    });

    if (!isAuthorized) {
      this.requestCredentials(response);

      throw new UnauthorizedException('Credenciales inválidas.');
    }

    return true;
  }

  private getCredentialCandidates(request: Request): IntegrationCredentials[] {
    const candidates: IntegrationCredentials[] = [];

    const headerCredentials = this.getHeaderCredentials(request);

    if (headerCredentials) {
      candidates.push(headerCredentials);
    }

    const basicAuthCredentials = this.getBasicAuthCredentials(request);

    if (basicAuthCredentials) {
      candidates.push(basicAuthCredentials);
    }

    return candidates;
  }

  private getHeaderCredentials(request: Request): IntegrationCredentials | null {
    const apiKey = getHeaderValue(request.headers['x-api-key']);
    const apiSecret = getHeaderValue(request.headers['x-api-secret']);

    const key = apiKey?.trim();
    const secret = apiSecret?.trim();

    if (!key || !secret) {
      return null;
    }

    return {
      key,
      secret,
      source: 'headers',
    };
  }

  private getBasicAuthCredentials(
    request: Request,
  ): IntegrationCredentials | null {
    const authorization = getHeaderValue(request.headers.authorization);

    if (!authorization) {
      return null;
    }

    const basicAuthMatch = authorization.match(/^Basic\s+(.+)$/i);

    if (!basicAuthMatch?.[1]) {
      return null;
    }

    const encodedCredentials = basicAuthMatch[1].trim();

    try {
      const decodedCredentials = Buffer.from(
        encodedCredentials,
        'base64',
      ).toString('utf8');

      const separatorIndex = decodedCredentials.indexOf(':');

      if (separatorIndex === -1) {
        return null;
      }

      const key = decodedCredentials.slice(0, separatorIndex).trim();
      const secret = decodedCredentials.slice(separatorIndex + 1).trim();

      if (!key || !secret) {
        return null;
      }

      return {
        key,
        secret,
        source: 'basic-auth',
      };
    } catch {
      return null;
    }
  }

  private requestCredentials(response: Response): void {
    response.setHeader(
      'WWW-Authenticate',
      'Basic realm="Kiichpam API Integration"',
    );
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