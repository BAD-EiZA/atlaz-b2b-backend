import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './shared/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('v1');

  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000','https://academy.hiatlaz.com'],
    credentials: true, // kalau pakai cookie / Authorization
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Idempotency-Key', // kamu pakai header ini → wajib diizinkan
    ],
    exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const cfg = new DocumentBuilder()
    .setTitle('Atlaz B2B API')
    .setDescription('Orgs • Members • Quotas • Payments • Report')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, cfg);
  SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/json' });

  await app.listen(process.env.PORT ?? 4002);
}
bootstrap();
