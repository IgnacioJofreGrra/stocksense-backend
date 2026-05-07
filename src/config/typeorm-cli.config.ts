import { config } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * DataSource para la CLI de TypeORM.
 *
 * Por que existe este archivo separado del databaseConfig() del modulo:
 * - El databaseConfig() del modulo recibe ConfigService inyectado y solo
 *   funciona dentro del runtime de NestJS.
 * - La CLI de typeorm-ts-node-commonjs corre fuera de NestJS — no hay DI.
 *   Necesita un DataSource exportado por defecto que lea env vars solo.
 *
 * Carga .env.local primero (formato del proyecto en Windows). Si no existe,
 * dotenv silenciosamente no hace nada y caen los defaults de process.env.
 *
 * Glob `src/**\/*.entity.ts`: TypeScript directo, ts-node lo compila al
 * vuelo. En produccion la app corre `dist/**\/*.entity.js` pero las
 * migrations no se generan en prod — solo se ejecutan.
 */
config({ path: '.env.local' });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'stocksense',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'stocksense',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
