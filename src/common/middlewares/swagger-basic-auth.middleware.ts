import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export function swaggerBasicAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const expectedUser = process.env.SWAGGER_USER;
  const expectedPassword = process.env.SWAGGER_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    response
      .status(503)
      .send('Swagger no tiene configuradas sus credenciales.');
    return;
  }

  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Basic ')) {
    requestCredentials(response);
    return;
  }

  const encodedCredentials = authorization.replace('Basic ', '').trim();

  try {
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');

    const separatorIndex = decodedCredentials.indexOf(':');

    if (separatorIndex === -1) {
      requestCredentials(response);
      return;
    }

    const user = decodedCredentials.slice(0, separatorIndex);
    const password = decodedCredentials.slice(separatorIndex + 1);

    const isValidUser = safeCompare(user, expectedUser);
    const isValidPassword = safeCompare(password, expectedPassword);

    if (!isValidUser || !isValidPassword) {
      requestCredentials(response);
      return;
    }

    next();
  } catch {
    requestCredentials(response);
  }
}

function requestCredentials(response: Response): void {
  response.setHeader('WWW-Authenticate', 'Basic realm="Kiichpam API Docs"');
  response.status(401).send('Autenticación requerida.');
}

function safeCompare(value: string, expectedValue: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expectedValue);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}