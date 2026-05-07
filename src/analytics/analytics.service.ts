import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { AnalyticsEvent, EventMetadata } from './schemas/analytics-event.schema';

/**
 * Datos crudos para registrar un evento. El service calcula la metadata
 * temporal a partir del timestamp.
 */
export interface RegistrarEventoInput {
  tipo: string; // 'entrada' | 'salida' | 'ajuste'
  productoId: string;
  ean13: string;
  nombreProducto: string;
  cantidad: number;
  userId: string;
  comercioNombre: string;
  timestamp: Date;
}

/** Opciones comunes a las queries de analitica. */
export interface RangoOpciones {
  desde?: Date;
  hasta?: Date;
  limite?: number;
}

export interface ProductoMasVendido {
  productoId: string;
  ean13: string;
  nombreProducto: string;
  totalVendido: number;
  cantidadMovimientos: number;
}

export interface VentasPorDia {
  diaSemana: number;
  nombreDia: string;
  totalVentas: number;
}

export interface VentasPorHora {
  hora: number;
  totalVentas: number;
}

export interface TendenciaPunto {
  periodo: string; // ej "2026-05"
  totalMovimientos: number;
  cantidadTotal: number;
}

export interface ResumenPeriodo {
  totalEntradas: number;
  totalSalidas: number;
  productosUnicos: number;
  movimientosTotales: number;
  promedioDiarioVentas: number;
}

const NOMBRES_DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

/**
 * AnalyticsService.
 *
 * Vive contra MongoDB (no PostgreSQL). Recibe eventos desnormalizados de
 * InventoryService y expone agregaciones para dashboards.
 *
 * No conoce a Product, User ni TypeORM. Todo lo que necesita ya viene
 * desnormalizado en cada documento (nombreProducto, comercioNombre, ean13).
 * Esto evita JOINs cross-BD que serian un dolor: como las dos BDs no
 * comparten transacciones, mezclar datos en runtime requiere una llamada
 * extra a Postgres por cada evento, anulando el beneficio analitico.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(AnalyticsEvent.name)
    private readonly eventModel: Model<AnalyticsEvent>,
  ) {}

  /**
   * Registra un evento. Calcula la metadata temporal al vuelo.
   *
   * Puede lanzar si Mongo esta caido. El caller (InventoryService) lo
   * envuelve en fire-and-forget; este service no oculta los errores
   * porque otros consumidores (ej. tests) pueden querer detectarlos.
   */
  async registrarEvento(input: RegistrarEventoInput): Promise<void> {
    const metadata: EventMetadata = {
      diaSemana: input.timestamp.getDay(),
      hora: input.timestamp.getHours(),
      mes: input.timestamp.getMonth() + 1, // getMonth() es 0-indexed
      anio: input.timestamp.getFullYear(),
    };
    await this.eventModel.create({
      tipo: input.tipo,
      productoId: input.productoId,
      ean13: input.ean13,
      nombreProducto: input.nombreProducto,
      cantidad: input.cantidad,
      userId: input.userId,
      comercioNombre: input.comercioNombre,
      timestamp: input.timestamp,
      metadata,
    });
  }

  /**
   * Top productos vendidos (tipo=salida) en el rango.
   * Ordenado por cantidad total descendente.
   */
  async productosMasVendidos(
    userId: string,
    opciones: RangoOpciones = {},
  ): Promise<ProductoMasVendido[]> {
    const limite = opciones.limite ?? 10;
    const pipeline: PipelineStage[] = [
      { $match: this.armarMatch(userId, opciones, 'salida') },
      {
        $group: {
          _id: '$productoId',
          ean13: { $first: '$ean13' },
          nombreProducto: { $first: '$nombreProducto' },
          totalVendido: { $sum: '$cantidad' },
          cantidadMovimientos: { $sum: 1 },
        },
      },
      { $sort: { totalVendido: -1 } },
      { $limit: limite },
    ];
    const rows = await this.eventModel.aggregate<{
      _id: string;
      ean13: string;
      nombreProducto: string;
      totalVendido: number;
      cantidadMovimientos: number;
    }>(pipeline);
    return rows.map((r) => ({
      productoId: r._id,
      ean13: r.ean13,
      nombreProducto: r.nombreProducto,
      totalVendido: r.totalVendido,
      cantidadMovimientos: r.cantidadMovimientos,
    }));
  }

  /**
   * Distribucion de ventas por dia de la semana (0=Dom, 6=Sab).
   * Mapea el numero a nombre en español para que el frontend no tenga
   * que hacer la traduccion y los nombres queden consistentes en logs.
   */
  async ventasPorDiaSemana(userId: string, opciones: RangoOpciones = {}): Promise<VentasPorDia[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.armarMatch(userId, opciones, 'salida') },
      {
        $group: {
          _id: '$metadata.diaSemana',
          totalVentas: { $sum: '$cantidad' },
        },
      },
      { $sort: { _id: 1 } },
    ];
    const rows = await this.eventModel.aggregate<{ _id: number; totalVentas: number }>(pipeline);
    return rows.map((r) => ({
      diaSemana: r._id,
      nombreDia: NOMBRES_DIAS[r._id] ?? '?',
      totalVentas: r.totalVentas,
    }));
  }

  /**
   * Distribucion de ventas por hora (0-23). Util para ver horas pico.
   */
  async ventasPorHora(userId: string, opciones: RangoOpciones = {}): Promise<VentasPorHora[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.armarMatch(userId, opciones, 'salida') },
      {
        $group: {
          _id: '$metadata.hora',
          totalVentas: { $sum: '$cantidad' },
        },
      },
      { $sort: { _id: 1 } },
    ];
    const rows = await this.eventModel.aggregate<{ _id: number; totalVentas: number }>(pipeline);
    return rows.map((r) => ({ hora: r._id, totalVentas: r.totalVentas }));
  }

  /**
   * Tendencia temporal de un producto: agrupa por mes (anio-mes).
   * Cuenta movimientos (todos los tipos) y suma cantidad.
   */
  async tendenciaProducto(
    productoId: string,
    userId: string,
    opciones: RangoOpciones = {},
  ): Promise<TendenciaPunto[]> {
    const match: Record<string, unknown> = {
      userId,
      productoId,
      ...this.armarRangoTimestamp(opciones),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: { anio: '$metadata.anio', mes: '$metadata.mes' },
          totalMovimientos: { $sum: 1 },
          cantidadTotal: { $sum: '$cantidad' },
        },
      },
      { $sort: { '_id.anio': 1, '_id.mes': 1 } },
    ];
    const rows = await this.eventModel.aggregate<{
      _id: { anio: number; mes: number };
      totalMovimientos: number;
      cantidadTotal: number;
    }>(pipeline);
    return rows.map((r) => ({
      periodo: `${r._id.anio}-${String(r._id.mes).padStart(2, '0')}`,
      totalMovimientos: r.totalMovimientos,
      cantidadTotal: r.cantidadTotal,
    }));
  }

  /**
   * Resumen del periodo: totales y promedios para dashboard.
   *
   * Un solo pipeline en BD: usar $cond dentro de $sum permite contar
   * por tipo sin separar en multiples pipelines/llamadas.
   * $addToSet captura productos unicos; al final $size cuenta cuantos.
   */
  async resumenPeriodo(userId: string, opciones: RangoOpciones = {}): Promise<ResumenPeriodo> {
    const match: Record<string, unknown> = {
      userId,
      ...this.armarRangoTimestamp(opciones),
    };
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalEntradas: {
            $sum: { $cond: [{ $eq: ['$tipo', 'entrada'] }, '$cantidad', 0] },
          },
          totalSalidas: {
            $sum: { $cond: [{ $eq: ['$tipo', 'salida'] }, '$cantidad', 0] },
          },
          productosUnicos: { $addToSet: '$productoId' },
          movimientosTotales: { $sum: 1 },
          // Tomamos los timestamps min/max para calcular promedio diario.
          primerEvento: { $min: '$timestamp' },
          ultimoEvento: { $max: '$timestamp' },
        },
      },
    ];
    const [row] = await this.eventModel.aggregate<{
      totalEntradas: number;
      totalSalidas: number;
      productosUnicos: string[];
      movimientosTotales: number;
      primerEvento: Date | null;
      ultimoEvento: Date | null;
    }>(pipeline);

    if (!row) {
      return {
        totalEntradas: 0,
        totalSalidas: 0,
        productosUnicos: 0,
        movimientosTotales: 0,
        promedioDiarioVentas: 0,
      };
    }

    // Promedio diario: total salidas dividido los dias entre primer y ultimo evento.
    let dias = 1;
    if (row.primerEvento && row.ultimoEvento) {
      const ms = row.ultimoEvento.getTime() - row.primerEvento.getTime();
      dias = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }
    return {
      totalEntradas: row.totalEntradas,
      totalSalidas: row.totalSalidas,
      productosUnicos: row.productosUnicos.length,
      movimientosTotales: row.movimientosTotales,
      promedioDiarioVentas: Math.round((row.totalSalidas / dias) * 100) / 100,
    };
  }

  /**
   * Helper: arma el $match con userId + rango temporal + tipo opcional.
   */
  private armarMatch(
    userId: string,
    opciones: RangoOpciones,
    tipo?: string,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { userId, ...this.armarRangoTimestamp(opciones) };
    if (tipo) {
      match.tipo = tipo;
    }
    return match;
  }

  private armarRangoTimestamp(opciones: RangoOpciones): Record<string, unknown> {
    if (!opciones.desde && !opciones.hasta) {
      return {};
    }
    const rango: Record<string, Date> = {};
    if (opciones.desde) rango.$gte = opciones.desde;
    if (opciones.hasta) rango.$lte = opciones.hasta;
    return { timestamp: rango };
  }

  /**
   * Logger expuesto para que InventoryService pueda loguear el fallo del
   * fire-and-forget (asi todos los logs de analitica salen con el mismo
   * contexto en consola).
   */
  get log(): Logger {
    return this.logger;
  }
}
