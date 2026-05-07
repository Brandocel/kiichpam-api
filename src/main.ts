import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { swaggerBasicAuth } from './common/middlewares/swagger-basic-auth.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const uploadsPath = join(process.cwd(), 'uploads');

  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  const allowedOrigins = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://dolphin-app-ogc8k.ondigitalocean.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS bloqueado para origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Stripe-Signature',
      'stripe-signature',
      'Accept',
      'Origin',
      'x-api-key',
      'x-api-secret',
    ],
    optionsSuccessStatus: 204,
  });

  app.use(
    '/uploads',
    express.static(uploadsPath, {
      index: false,
      fallthrough: false,
      redirect: false,
      etag: true,
      maxAge: '7d',
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * Protección de Swagger.
   * Primero protege la ruta y después monta Swagger.
   */
  app.use('/docs', swaggerBasicAuth);
  app.use('/docs-json', swaggerBasicAuth);
  app.use('/docs-yaml', swaggerBasicAuth);

  const config = new DocumentBuilder()
    .setTitle('Kiichpam API')
    .setDescription('API de reservaciones de paquetes')
    .setVersion('1.0.0')

    /**
     * Para un futuro login administrativo con JWT.
     * Ojo: esto solo documenta Swagger, no protege rutas por sí solo.
     */
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT para endpoints administrativos.',
      },
      'bearer',
    )

    /**
     * Seguridad recomendada para integraciones externas.
     * Username = API_CLIENT_KEY
     * Password = API_CLIENT_SECRET
     */
    .addBasicAuth(
      {
        type: 'http',
        scheme: 'basic',
        description:
          'Basic Auth para integraciones. Usa API_CLIENT_KEY como usuario y API_CLIENT_SECRET como contraseña.',
      },
      'integration-basic',
    )

    /**
     * Alternativa para integraciones externas usando headers.
     */
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Llave pública de integración.',
      },
      'x-api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-secret',
        in: 'header',
        description: 'Llave secreta de integración.',
      },
      'x-api-secret',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = Number(process.env.PORT) || 8080;
  const publicUrl = process.env.APP_URL || `http://localhost:${port}`;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on port ${port}`);
  console.log(`📚 Swagger available at: ${publicUrl}/docs`);
  console.log(`❤️ Health available at: ${publicUrl}/health`);
  console.log(`📡 Ping available at: ${publicUrl}/ping`);
}

bootstrap();