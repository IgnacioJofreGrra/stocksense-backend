/**
 * Token de inyeccion para el PubSub. Lo usamos asi en lugar de inyectar
 * la clase PubSub directa para poder swapear la implementacion en tests
 * (ej. un PubSub falso) o en produccion (ej. RedisPubSub para multi-instancia).
 */
export const PUB_SUB = 'PUB_SUB';

/**
 * Nombre del trigger de la subscription alertaStockBajo.
 * Centralizado para que emisor (listener) y resolver coincidan exacto.
 */
export const ALERTA_STOCK_BAJO_TRIGGER = 'ALERTA_STOCK_BAJO';

/**
 * Nombre del evento de dominio interno (EventEmitter).
 * Lo emite InventoryService cuando una salida deja stock <= stockMinimo.
 * Lo escucha el bridge en la capa GraphQL.
 */
export const EVENT_STOCK_ALERTA_BAJA = 'stock.alerta-baja';
