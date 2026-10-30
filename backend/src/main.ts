import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL')!.split(',').map((s) => s.trim()),
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('Premier League Backend')
    .setDescription('Teams, fixtures, lineups and player statistics. Path IDs use API-Football IDs.')
    .setVersion('0.1.0')
    .addBearerAuth(undefined, 'admin')
    .build());
  SwaggerModule.setup('api/docs', app, document);
  const port = config.get<number>('PORT')!;
  const host = config.get<string>('HOST') || (config.get<string>('NODE_ENV') === 'production' ? '0.0.0.0' : '127.0.0.1');
  await app.listen(port, host);
  console.log(`Backend listening on ${host}:${port} | API: /api | Swagger: /api/docs`);
}

void bootstrap();
