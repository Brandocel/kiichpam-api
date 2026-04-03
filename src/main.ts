import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * =========================================================
   * Stripe Webhook
   * =========================================================
   * Stripe necesita el body "crudo" (raw body) para validar la
   * firma del header Stripe-Signature.
   *
   * IMPORTANTE:
   * Esta línea debe ir ANTES de express.json()
   */
  app.use('/payments/webhook', express.raw({ type: 'application/json' }));

  /**
   * =========================================================
   * Parsers normales para el resto de endpoints
   * =========================================================
   */
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  /**
   * =========================================================
   * CORS
   * =========================================================
   */
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3000',
    'https://kiichpam-api-jpuw6.ondigitalocean.app/',
    // 'https://tudominio.com',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Permite Postman, curl, Stripe, server-to-server, etc.
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  });

  /**
   * =========================================================
   * Preflight OPTIONS
   * =========================================================
   */
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  /**
   * =========================================================
   * Pipes globales
   * =========================================================
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * =========================================================
   * Interceptors / Filters
   * =========================================================
   */
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * =========================================================
   * Swagger
   * =========================================================
   */
  const config = new DocumentBuilder()
    .setTitle('Kichpam API')
    .setDescription('API de reservaciones de paquetes')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  /**
   * =========================================================
   * Start server
   * =========================================================
   */
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();