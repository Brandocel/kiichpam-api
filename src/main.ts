import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const uploadsPath = join(process.cwd(), 'uploads');

  // asegurar que exista la carpeta uploads
  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  /**
   * =========================================================
   * Stripe Webhook
   * =========================================================
   */
  app.use('/payments/webhook', express.raw({ type: 'application/json' }));

  /**
   * =========================================================
   * Static uploads
   * =========================================================
   */
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

  /**
   * =========================================================
   * Parsers normales
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
    'https://kiichpam-api-jpuw6.ondigitalocean.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
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