import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NightlyPredictionsService, type ResumenJobNocturno } from './nightly-predictions.service';

/**
 * Handler para AWS Lambda.
 *
 * Activado por EventBridge (CloudWatch Events) con un cron nocturno.
 * Ejemplo de regla: `cron(0 6 * * ? *)` => 6 AM UTC ~= 3 AM Chile en
 * horario standard, ~2 AM en DST.
 *
 * Para deploy:
 * 1. `npm run build` (genera dist/)
 * 2. Empaquetar: dist/jobs/lambda-handler.js + node_modules en un .zip
 *    (excluir devDependencies; si pesa mucho, usar layer separada).
 * 3. Lambda > Create function > Node.js 20.x > subir el .zip.
 * 4. Handler: `dist/jobs/lambda-handler.handler`.
 * 5. Variables de entorno: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD,
 *    DB_NAME, MONGO_URI, JWT_SECRET, GROQ_API_KEY, AWS_SES_REGION,
 *    AWS_SES_FROM_EMAIL, FRONTEND_URL, NODE_ENV=production.
 * 6. IAM role: SES SendEmail permissions + acceso a la VPC del RDS si
 *    Postgres esta en RDS privado.
 * 7. Timeout: 5 minutos (default es 3s — la IA tarda).
 * 8. EventBridge: crear regla con la expresion cron y target = esta
 *    Lambda.
 *
 * Cuando preferir cron en EC2 vs Lambda: ver docs/DEPLOY-AWS.md.
 *
 * Estructura del response: lo que devuelve aqui queda en CloudWatch Logs y
 * tambien va a EventBridge si se configura un destino. Es JSON-serializable.
 */
export async function handler(event: unknown): Promise<{
  ok: boolean;
  resumen?: ResumenJobNocturno;
  error?: string;
}> {
  const logger = new Logger('LambdaNightly');
  logger.log(`Lambda invocada con event: ${JSON.stringify(event ?? {})}`);

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'warn', 'error'],
    });
    const job = app.get(NightlyPredictionsService);
    const resumen = await job.run();
    return { ok: true, resumen };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    logger.error(`Fallo fatal: ${message}`);
    return { ok: false, error: message };
  } finally {
    if (app) {
      await app.close();
    }
  }
}
