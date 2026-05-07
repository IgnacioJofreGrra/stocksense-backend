import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { join } from 'path';
import configuration from './config/configuration';
import { databaseConfig } from './config/database.config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GraphqlResolversModule } from './graphql/graphql-resolvers.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';

/**
 * AppModule = modulo raiz.
 *
 * TypeOrmModule.forRootAsync con useFactory:
 * - El factory recibe ConfigService inyectado y construye las opciones
 *   despues de que ConfigModule ya leyo las env vars. Usar forRoot sincrono
 *   con process.env directo lleeria valores vacios al inicializar el modulo.
 * - inject: [ConfigService] -> NestJS resuelve la dependencia y la pasa al
 *   factory. Patron estandar para configuracion async en NestJS.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    /**
     * MongooseModule.forRootAsync — segunda BD para analitica.
     *
     * Cohabita con TypeORM sin conflicto: cada *Module registra providers
     * distintos en el container DI de NestJS. Inyectas Repository<T> y
     * obtenes TypeORM; inyectas Model<T> y obtenes Mongoose.
     *
     * Tolerancia a fallos:
     * - serverSelectionTimeoutMS: 3000 -> si Mongo no responde en 3s,
     *   Mongoose levanta error en lugar de colgar la conexion forever.
     * - El registro fire-and-forget en AnalyticsService swallow-ea los
     *   errores de operaciones individuales. Pero si Mongo esta down al
     *   arrancar, queremos que la app igual arranque.
     */
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongo.uri', ''),
        serverSelectionTimeoutMS: 3000,
        connectionFactory: (connection: {
          on: (event: string, cb: (err: Error) => void) => void;
        }) => {
          // Logueamos errores asincronos sin tumbar la app.
          connection.on('error', (err) => {
            Logger.warn(`Mongo connection error: ${err.message}`, 'MongooseModule');
          });
          return connection;
        },
      }),
    }),
    /**
     * EventEmitterModule — bus interno de eventos de dominio.
     *
     * Por que: el InventoryService emite "stock.alerta-baja" cuando una
     * salida deja el stock bajo el minimo. La capa GraphQL escucha y
     * republica al PubSub para los suscriptos. Asi InventoryService NO
     * importa graphql-subscriptions; queda decoupled.
     */
    EventEmitterModule.forRoot(),
    /**
     * GraphQLModule.forRoot con Apollo Driver (code-first).
     *
     * - autoSchemaFile: NestJS genera src/schema.gql al arrancar leyendo
     *   los decoradores. Una sola fuente de verdad: el codigo TS.
     * - sortSchema: ordena el SDL alfabeticamente -> diffs de git limpios
     *   cuando se agrega un campo.
     * - subscriptions con graphql-ws (NO el deprecado subscriptions-
     *   transport-ws): protocolo moderno, soportado por Apollo Client v3+.
     * - context: normaliza el shape para que el guard funcione en HTTP y
     *   en WebSocket. Para HTTP, req viene del request Express. Para WS,
     *   reconstruimos un req con headers.authorization desde connectionParams.
     */
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true, // UI built-in en desarrollo
      subscriptions: {
        'graphql-ws': {
          // Tipos de graphql-ws son complejos; usamos `unknown` y casteamos
          // al campo que necesitamos. La logica es: tomar el token de
          // connectionParams y guardarlo en extra para que la subscription
          // tenga acceso al `Authorization` header durante el ciclo del WS.
          onConnect: (context: unknown) => {
            const ctx = context as { connectionParams?: Record<string, unknown>; extra?: unknown };
            const params = ctx.connectionParams ?? {};
            const auth = (params.Authorization ?? params.authorization) as string | undefined;
            const currentExtra = (ctx.extra ?? {}) as Record<string, unknown>;
            (context as { extra: unknown }).extra = {
              ...currentExtra,
              headers: { authorization: auth },
            };
          },
        },
      },
      context: (ctx: { req?: unknown; extra?: unknown }) => {
        // HTTP: el request de Express ya trae headers.authorization.
        if (ctx.req) return { req: ctx.req };
        // WS: reconstruimos un "req" minimo con los headers que pusimos en onConnect.
        return { req: ctx.extra };
      },
    }),
    UsersModule,
    AuthModule,
    ProductsModule,
    InventoryModule,
    AnalyticsModule,
    AiModule,
    NotificationsModule,
    JobsModule,
    GraphqlResolversModule,
  ],
})
export class AppModule {}
