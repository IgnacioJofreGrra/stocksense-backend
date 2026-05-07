import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstrap = punto de entrada de NestJS.
 *
 * ValidationPipe global con:
 * - whitelist: true -> elimina del body cualquier campo que no este declarado
 *   en el DTO. Defensa contra mass assignment (ej. cliente intenta enviar
 *   `rol: 'dueno'` en /auth/register; lo descartamos).
 * - forbidNonWhitelisted: true -> rechaza el request con 400 si trae campos
 *   extra. Mas estricto que whitelist solo (que silenciosamente los ignora).
 * - transform: true -> convierte tipos (ej. "5" -> 5 si DTO declara number).
 *   Usa class-transformer detras.
 *
 * Swagger:
 * - Endpoint /api/docs: deliberadamente bajo /api para poder filtrar por
 *   prefijo en produccion (auth/rate-limit/IP allowlist) si hace falta.
 * - addBearerAuth(): pinta un boton "Authorize" en la UI. El user pega su
 *   access token y todas las requests "Try it out" lo incluyen.
 * - El plugin de @nestjs/swagger (configurado en nest-cli.json) auto-genera
 *   @ApiProperty para los campos de los DTOs leyendo sus tipos TS y
 *   decoradores de class-validator. Asi no decoramos campo por campo.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  /**
   * CORS:
   * - origins fijos para dev (Vite en 5173, mismo host en 3000).
   * - process.env.FRONTEND_URL para el dominio de produccion (Vercel).
   * - filter(Boolean) ignora `undefined` cuando FRONTEND_URL no esta seteado
   *   (en local el array queda con los 2 localhost).
   * - credentials: true para permitir cookies/Authorization headers.
   * - El CORS de NestJS aplica al HTTP de Express. Apollo subscriptions
   *   sobre WS se sirven en el mismo servidor; al estar el WS detras de
   *   Nginx con `Upgrade`/`Connection`, no necesita su propia config CORS.
   */
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000', process.env.FRONTEND_URL].filter(
      Boolean,
    ) as string[],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockSense API')
    .setDescription(
      'API REST de StockSense. Gestion de inventario para comercios de barrio.\n\n' +
        'Autenticacion: obtener access token via POST /auth/login y pegarlo en el boton "Authorize".',
    )
    .setVersion('1.0.0')
    .addTag('auth', 'Registro, login, refresh y logout')
    .addTag('products', 'Catalogo de productos con EAN-13')
    .addTag('inventory', 'Movimientos de stock, alertas y consultas')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token JWT obtenido de POST /auth/login',
      },
      'JWT', // nombre simbolico que despues referenciamos con @ApiBearerAuth('JWT')
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      // Mantiene el token entre recargas de la pagina (UX mejor para probar).
      persistAuthorization: true,
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);

  await app.listen(port);
  Logger.log(`StockSense backend escuchando en http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger UI en http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();
