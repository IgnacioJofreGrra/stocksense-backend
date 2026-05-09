import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { NightlyPredictionsService } from './nightly-predictions.service';

/**
 * JobsModule — agrupa los servicios que ejecutan tareas batch.
 *
 * Importable tanto desde AppModule (no es necesario, pero permite ejecutar
 * el job desde dentro de la app si en algun futuro se expone un endpoint
 * admin) como desde el bootstrap standalone (`src/jobs/run-nightly.ts`)
 * y la Lambda (`src/jobs/lambda-handler.ts`).
 */
@Module({
  imports: [UsersModule, AiModule, NotificationsModule],
  providers: [NightlyPredictionsService],
  exports: [NightlyPredictionsService],
})
export class JobsModule {}
