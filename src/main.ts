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

  // Crear carpeta uploads si no existe
  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  /**
   * =========================================================
   * Stripe Webhook (raw body)
   * =========================================================
   */
  app.use('/payments/webhook', express.raw({ type: 'application/json' }));

  /**
   * =========================================================
   * Static files (uploads)
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
   * Body parsers
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
    'https://kiichpam-api-jpuw6.ondigitalocean.app',   // actualiza si cambia el dominio
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
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
   * Global Pipes, Interceptors y Filters
   * =========================================================
   */
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
   * START SERVER - ¡ESTO ES LO MÁS IMPORTANTE!
   * =========================================================
   */
  const port = Number(process.env.PORT) || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
  console.log(`📚 Swagger available at: http://0.0.0.0:${port}/docs`);
}

bootstrap();