import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Factory de configuracion para TypeORM.
 *
 * Decisiones:
 * - autoLoadEntities: true -> los modulos registran sus entidades con
 *   TypeOrmModule.forFeature([Entity]) y se cargan automaticamente. Evita
 *   tener que mantener una lista global de entidades o usar glob de archivos.
 * - synchronize: solo en development. En produccion se apaga porque puede
 *   eliminar columnas/tablas al detectar diferencias. En prod se usan
 *   migrations explicitas.
 * - migrations + migrationsRun en prod: al arrancar la app, TypeORM aplica
 *   las migrations pendientes. Glob apunta a `dist/migrations/*.js` porque
 *   en runtime el codigo ya esta compilado (en dev no se ejecutan: synchronize
 *   ya mantiene el schema).
 * - logging: errores siempre, queries solo en dev. Util para depurar pero
 *   ruidoso en prod.
 */
export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const isDev = nodeEnv === 'development';

  return {
    type: 'postgres',
    host: configService.get<string>('database.host', 'localhost'),
    port: configService.get<number>('database.port', 5432),
    username: configService.get<string>('database.username', 'stocksense'),
    password: configService.get<string>('database.password', ''),
    database: configService.get<string>('database.name', 'stocksense'),
    entities: [],
    autoLoadEntities: true,
    synchronize: isDev,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: !isDev,
    logging: isDev ? ['error', 'warn', 'query'] : ['error'],
  };
};
