/**
 * Tipos publicos del modulo de notificaciones.
 *
 * `AlertaEmail` es el contrato entre el job nocturno (productor) y
 * NotificationsService (consumidor). Todo lo necesario para renderizar
 * el email viaja en este objeto — el service no consulta la BD.
 */

export interface ProductoUrgente {
  nombre: string;
  ean13: string;
  stockActual: number;
  diasHastaAgotamiento: number;
  cantidadSugeridaReponer: number;
}

export interface AlertaEmail {
  userId: string;
  email: string;
  comercioNombre: string;
  productosUrgentes: ProductoUrgente[];
}
