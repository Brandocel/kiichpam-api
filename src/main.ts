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

  if (!existsSync(uploadsPath)) {
    mkdirSync(uploadsPath, { recursive: true });
  }

  /**
   * IMPORTANTE:
   * Aquí van los dominios desde donde se consume la API.
   * O sea: FRONTEND, no backend.
   */
  const allowedOrigins = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',

    // Agrega aquí tu frontend real:
    // 'https://tu-frontend.com',
    // 'https://kiichpam.com',
    // 'https://www.kiichpam.com',

    // Si tu frontend también está en DigitalOcean App Platform:
    // 'https://nombre-de-tu-frontend.ondigitalocean.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      /**
       * Permite requests sin origin:
       * Swagger, Postman, Insomnia, curl, health checks, etc.
       */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS bloqueado para origin: ${origin}`);

      /**
       * No mandes Error aquí porque te genera 500.
       * Mejor regresar false.
       */
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Stripe-Signature',
      'Accept',
      'Origin',
    ],
    optionsSuccessStatus: 204,
  });

  app.use('/payments/webhook', express.raw({ type: 'application/json' }));

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

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Kiichpam API')
    .setDescription('API de reservaciones de paquetes')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT) || 8080;

  const publicUrl = process.env.APP_URL || `http://localhost:${port}`;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on port ${port}`);
  console.log(`📚 Swagger available at: ${publicUrl}/docs`);
  console.log(`❤️ Health available at: ${publicUrl}/health`);
  console.log(`📡 Ping available at: ${publicUrl}/ping`);
}

bootstrap();