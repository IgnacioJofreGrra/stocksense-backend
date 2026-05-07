import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PubSub } from 'graphql-subscriptions';
import { StockAlertaBajaEvent } from '../../inventory/inventory.service';
import { ALERTA_STOCK_BAJO_TRIGGER, EVENT_STOCK_ALERTA_BAJA, PUB_SUB } from './pubsub.constants';

/**
 * Bridge entre el bus de eventos de dominio (EventEmitter) y el PubSub
 * de GraphQL (graphql-subscriptions).
 *
 * Por que existe: InventoryService no debe conocer GraphQL. Solo emite
 * un evento de dominio "stock.alerta-baja". Aqui lo escuchamos y
 * republicamos al trigger del PubSub que la subscription consume.
 *
 * Beneficio: si manana removemos GraphQL, InventoryService no cambia.
 * Si manana queremos otro listener (ej. mandar email), agregamos otro
 * @OnEvent en otra clase.
 */
@Injectable()
export class StockAlertListener {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  @OnEvent(EVENT_STOCK_ALERTA_BAJA)
  async onAlertaStockBaja(payload: StockAlertaBajaEvent): Promise<void> {
    // El payload del PubSub debe matchear el shape que el resolver
    // declarara con `@Subscription(() => AlertaStock)`. La key del
    // objeto = nombre del campo del resolver (camelCase, alertaStockBajo).
    await this.pubSub.publish(ALERTA_STOCK_BAJO_TRIGGER, {
      alertaStockBajo: {
        producto: payload.producto,
        stockActual: payload.stockActual,
        stockMinimo: payload.stockMinimo,
        diferencia: payload.diferencia,
      },
      // userId aparte (no en alertaStockBajo): lo usa el filter de la
      // subscription para emitir solo a los suscriptos del mismo comercio.
      _meta: { userId: payload.userId },
    });
  }
}
