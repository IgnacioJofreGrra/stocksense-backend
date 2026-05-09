import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createHash } from 'node:crypto';

/**
 * Evento que dispara la invalidacion. InventoryService lo emite cada vez
 * que registra un movimiento (entrada/salida/ajuste).
 */
export const STOCK_MOVIMIENTO_EVENT = 'stock.movimiento';
export interface StockMovimientoEvent {
  userId: string;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * AiCacheService — cache in-memory con TTL e invalidacion por evento.
 *
 * Por que cachear:
 * - Las predicciones no cambian minuto a minuto. Si el dueño abre el
 *   dashboard 3 veces seguidas, no tiene sentido gastar 3 calls a Groq
 *   (cuotas + latencia ~2s por call).
 *
 * Como invalidamos:
 * - Por TTL: 30 minutos.
 * - Por evento de dominio: cuando se registra un movimiento de stock
 *   para userId X, borramos todas las entries `${X}:*`. La logica
 *   subyacente cambio -> la prediccion vieja ya no es util.
 *
 * Por que Map y no Redis: 1 instancia del backend. Si escalamos a
 * multi-instancia con load balancer, swappear por @nestjs/cache-manager +
 * Redis sin tocar AiService (consume `get()`/`set()`).
 */
@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);
  private readonly store = new Map<string, Entry<unknown>>();

  /**
   * Construye una key estable a partir de userId + endpoint + params.
   * Hashear los params asegura que dos llamadas con el mismo objeto
   * comparten cache aunque la serializacion difiera en orden.
   */
  buildKey(userId: string, endpoint: string, params: Record<string, unknown>): string {
    const paramsHash = createHash('sha256')
      .update(JSON.stringify(params, Object.keys(params).sort()))
      .digest('hex')
      .slice(0, 16);
    return `${userId}:${endpoint}:${paramsHash}`;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Invalida todas las entries del usuario. Lo llama el listener cuando
   * llega un evento stock.movimiento.
   */
  invalidateUser(userId: string): number {
    const prefix = `${userId}:`;
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Listener: cada vez que se registra un movimiento, invalidamos el
   * cache del user. Asi la proxima call a /ai/predict-restock arma con
   * datos frescos.
   */
  @OnEvent(STOCK_MOVIMIENTO_EVENT)
  onStockMovimiento(payload: StockMovimientoEvent): void {
    const count = this.invalidateUser(payload.userId);
    if (count > 0) {
      this.logger.debug(`Cache IA invalidado para user ${payload.userId}: ${count} entries`);
    }
  }
}
