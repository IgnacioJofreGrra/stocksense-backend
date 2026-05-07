import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>;

/**
 * Metadata temporal del evento.
 *
 * Se calcula en el server al momento de crear el evento (no se confia en
 * lo que mande el cliente). Util para queries del estilo "ventas por dia
 * de la semana" sin tener que extraer la fecha en cada query.
 *
 * Mixed type: hoy temporal, mañana puede tener mas campos (ubicacion,
 * clima, etc.) sin necesitar migracion. MongoDB acepta documentos con
 * forma variable.
 */
export interface EventMetadata {
  diaSemana: number; // 0 = domingo, 6 = sabado (estandar JS getDay())
  hora: number; // 0-23
  mes: number; // 1-12
  anio: number;
  [key: string]: unknown; // extensible
}

/**
 * AnalyticsEvent: evento desnormalizado de movimiento de stock.
 *
 * NO es una entidad TypeORM: vive en MongoDB, en la coleccion
 * `analytics_events`. La fuente de verdad sigue siendo `stock_movements`
 * en PostgreSQL — esto es solo para analitica.
 *
 * Decisiones:
 * - tipo como string con enum laxo (no importamos StockMovementType de
 *   inventory): MongoDB y PostgreSQL estan desacoplados. Si manana
 *   agregamos un tipo nuevo en PG, Mongo no se rompe.
 * - productoId/userId como string (UUID), no ObjectId: MongoDB no conoce
 *   PostgreSQL. La referencia es texto.
 * - nombreProducto y comercioNombre desnormalizados: se copian en el
 *   momento. Si manana cambia el nombre del producto, los eventos
 *   historicos mantienen el nombre original — lo correcto desde la
 *   optica analitica (refleja lo que paso en su momento).
 * - timestamps: false en @Schema: el timestamp es el del movimiento,
 *   controlado por nosotros. No queremos createdAt/updatedAt
 *   automaticos que se confundan con el momento real del evento.
 */
@Schema({ collection: 'analytics_events', timestamps: false })
export class AnalyticsEvent {
  @Prop({ required: true, enum: ['entrada', 'salida', 'ajuste'] })
  tipo!: string;

  @Prop({ required: true })
  productoId!: string;

  @Prop({ required: true })
  ean13!: string;

  @Prop({ required: true })
  nombreProducto!: string;

  @Prop({ required: true })
  cantidad!: number;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  comercioNombre!: string;

  @Prop({ required: true, type: Date })
  timestamp!: Date;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  metadata!: EventMetadata;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);

/**
 * Indices.
 *
 * - (userId, timestamp DESC): casi todas las queries filtran por user y
 *   ordenan por fecha. Index compuesto. El orden importa: la columna mas
 *   selectiva (userId) primero.
 *
 * - (userId, productoId, timestamp DESC): para `tendenciaProducto`.
 *   El (userId) prefijo del primer index no sirve aqui porque queremos
 *   tambien filtrar por productoId. MongoDB no usa indices "parciales"
 *   automaticamente.
 *
 * - (userId, metadata.diaSemana): para `ventasPorDiaSemana`. Sin este
 *   index la agregacion hace COLLSCAN sobre todos los eventos del user.
 */
AnalyticsEventSchema.index({ userId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ userId: 1, productoId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ userId: 1, 'metadata.diaSemana': 1 });
