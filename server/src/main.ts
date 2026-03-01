import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditTrailInterceptor } from './common/interceptors/audit-trail.interceptor';
import { WinstonLogger } from './common/logger/winston.logger';

async function bootstrap() {
  const logger = new WinstonLogger();
  const app = await NestFactory.create(AppModule, { logger });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new AuditTrailInterceptor(),
  );

  // CORS for Next.js frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('AuditPro API')
    .setDescription('DoD FMR Enterprise Audit Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('dod', 'DoD Financial Management Regulation endpoints')
    .addTag('engagements', 'Audit engagement management')
    .addTag('findings', 'Audit finding management')
    .addTag('analysis', 'Financial analysis endpoints')
    .addTag('reports', 'Report generation')
    .addTag('auth', 'Authentication and authorization')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`AuditPro NestJS server running on port ${port}`, 'Bootstrap');
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
