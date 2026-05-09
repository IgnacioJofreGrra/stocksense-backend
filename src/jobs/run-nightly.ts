import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NightlyPredictionsService } from './nightly-predictions.service';

/**
 * Entry point standalone del job nocturno.
 *
 * Bootstrappea NestJS sin HTTP listener (NestFactory.createApplicationContext)
 * para no levantar el servidor Express. Resuelve NightlyPredictionsService
 * via DI y ejecuta el run.
 *
 * Uso:
 * - Local:  npx ts-node src/jobs/run-nightly.ts
 * - Build:  node dist/jobs/run-nightly.js
 * - Cron:   crontab entry en EC2 (ver docs/DEPLOY-AWS.md)
 *
 * Exit codes:
 * - 0: ejecucion correcta (puede haber alertas, errores aislados loguean
 *      pero no rompen el run).
 * - 1: error fatal (no pudo bootstrapear, no hay BD, etc).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('NightlyJob');
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'warn', 'error'],
    });
    const job = app.get(NightlyPredictionsService);
    const resumen = await job.run();
    logger.log(`Resumen: ${JSON.stringify(resumen)}`);
    process.exitCode = 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    logger.error(`Fallo fatal del job: ${message}`);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

void bootstrap();
