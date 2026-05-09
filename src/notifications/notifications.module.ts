import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * NotificationsModule.
 *
 * Aislado a proposito: cualquier consumidor (job nocturno, futuros webhooks,
 * eventos de dominio) lo importa y obtiene NotificationsService via DI.
 * No depende de Inventory ni Products — el contrato es `AlertaEmail`.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
