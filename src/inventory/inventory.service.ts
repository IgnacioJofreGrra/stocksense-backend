import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { CreateAjusteDto } from './dto/create-ajuste.dto';
import { CreateEntradaDto } from './dto/create-entrada.dto';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { QueryMovimientosDto } from './dto/query-movimientos.dto';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity';

/**
 * Eventos de dominio que emite InventoryService.
 *
 * - STOCK_ALERTA_BAJA: cuando una salida deja stock <= stockMinimo.
 *   Lo escucha la capa GraphQL y republica al PubSub para subscriptions.
 *
 * - STOCK_MOVIMIENTO: cualquier movimiento (entrada/salida/ajuste).
 *   Lo escucha el cache de IA para invalidar predicciones del user
 *   (las predicciones quedan obsoletas cuando cambia el stock).
 *
 * Los redefinimos aca como strings para no importar de carpetas hermanas
 * (mantiene InventoryService desacoplado de graphql/ y ai/).
 */
const STOCK_ALERTA_BAJA_EVENT = 'stock.alerta-baja';
const STOCK_MOVIMIENTO_EVENT = 'stock.movimiento';

export interface StockMovimientoEventPayload {
  userId: string;
}

/**
 * Payload del evento. La capa GraphQL lo escucha y republica al PubSub.
 */
export interface StockAlertaBajaEvent {
  producto: Product;
  stockActual: number;
  stockMinimo: number;
  diferencia: number;
  userId: string;
}

export interface MovimientoResponse {
  movimiento: StockMovement;
  stockActual: number;
}

/**
 * Contexto del usuario que ejecuta el movimiento.
 *
 * Se pasa desde el controller (que ya tiene la User completa via
 * @CurrentUser()). Asi evitamos un query extra a users en cada movimiento
 * y NO tenemos que enriquecer el JWT con comercioNombre.
 */
export interface ActorContext {
  userId: string;
  comercioNombre: string;
}

export interface StockSnapshot {
  productId: string;
  stockActual: number;
  ultimoMovimiento: Date | null;
}

export interface AlertaStock {
  producto: Product;
  stockActual: number;
  stockMinimo: number;
  diferencia: number; // negativo: cuanto falta para alcanzar el minimo
}

export interface PaginatedMovimientos {
  data: StockMovement[];
  total: number;
  page: number;
  lastPage: number;
}

/**
 * InventoryService.
 *
 * Event sourcing simple: el stock no se almacena, se calcula sumando
 * movimientos. Por que asi y no con un campo `stockActual` en Product:
 *
 * + El historial es la fuente de verdad. Si manana descubrimos que el campo
 *   cache se desincronizo con los movimientos, recalcular es trivial.
 * + No hay que mantener invariantes complicadas (cada movimiento dispara un
 *   UPDATE del cache; si falla a mitad de la transaccion, queda inconsistente).
 *
 * - Costo: cada lectura de stock es una query agregada. Para volumenes de
 *   un comercio de barrio (cientos de movimientos por producto/año) es
 *   irrelevante. Si manana escalamos a miles por dia, agregamos un campo
 *   cache + indices y mantenemos el calculo como red de seguridad.
 *
 * Concurrencia: el chequeo "stock suficiente antes de salida" tiene una race
 * window: dos salidas concurrentes pueden cada una ver "10 disponibles" y
 * ambas insertar, dejando -5. Para un comercio de barrio (1 cajero a la vez)
 * es aceptable. Solucion futura si hace falta: SELECT FOR UPDATE en una
 * transaccion serializable, o cache con lock optimista.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(StockMovement)
    private readonly movimientosRepository: Repository<StockMovement>,
    private readonly productsService: ProductsService,
    private readonly analyticsService: AnalyticsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Registra una entrada de stock. Falla si el producto no existe o esta
   * desactivado (no se puede ingresar a un producto retirado).
   */
  async registrarEntrada(dto: CreateEntradaDto, actor: ActorContext): Promise<MovimientoResponse> {
    const producto = await this.productsService.buscarPorId(dto.productId, actor.userId);
    // El service de productos ya filtra activo:true por default; si llegamos
    // aqui, el producto esta activo.

    const movimiento = await this.crearMovimiento({
      tipo: StockMovementType.ENTRADA,
      cantidad: dto.cantidad,
      motivo: dto.motivo ?? 'compra',
      nota: dto.nota ?? null,
      productId: producto.id,
      userId: actor.userId,
    });

    this.emitirEventoAnalitico(movimiento, producto, actor);

    const stockActual = await this.calcularStockNumero(producto.id);
    return { movimiento, stockActual };
  }

  /**
   * Registra una salida de stock. Falla si el stock disponible es menor.
   */
  async registrarSalida(dto: CreateSalidaDto, actor: ActorContext): Promise<MovimientoResponse> {
    const producto = await this.productsService.buscarPorId(dto.productId, actor.userId);

    const stockAntes = await this.calcularStockNumero(producto.id);
    if (dto.cantidad > stockAntes) {
      throw new BadRequestException(
        `Stock insuficiente. Stock actual: ${stockAntes}, salida solicitada: ${dto.cantidad}`,
      );
    }

    const movimiento = await this.crearMovimiento({
      tipo: StockMovementType.SALIDA,
      cantidad: dto.cantidad,
      motivo: dto.motivo ?? 'venta',
      nota: dto.nota ?? null,
      productId: producto.id,
      userId: actor.userId,
    });

    this.emitirEventoAnalitico(movimiento, producto, actor);

    const stockDespues = stockAntes - dto.cantidad;

    // Si la salida dejo el stock <= stockMinimo, emitimos un evento de
    // dominio. La capa GraphQL lo escucha y republica al PubSub. Asi un
    // dashboard suscrito a la subscription `alertaStockBajo` recibe la
    // alerta sin polling.
    //
    // Por que un evento intermedio y no llamar al PubSub directo: mantiene
    // a InventoryService desacoplado de graphql-subscriptions. Si manana
    // queremos otro consumidor (ej. enviar email al dueño), agrega otro
    // listener — el service no cambia.
    if (stockDespues <= producto.stockMinimo) {
      this.eventEmitter.emit(STOCK_ALERTA_BAJA_EVENT, {
        producto,
        stockActual: stockDespues,
        stockMinimo: producto.stockMinimo,
        diferencia: stockDespues - producto.stockMinimo,
        userId: actor.userId,
      } satisfies StockAlertaBajaEvent);
    }

    return { movimiento, stockActual: stockDespues };
  }

  /**
   * Registra un ajuste de stock (positivo o negativo).
   *
   * Permitimos productos desactivados: caso de uso real es corregir el
   * historial de un producto retirado (ej. el dueño descubre que tenia 3
   * unidades olvidadas y necesita reflejarlo en libros).
   *
   * Validamos que el ajuste no deje stock negativo: el modelo no impide
   * que -10 unidades existan en BD, pero conceptualmente "tener -10 panes"
   * no es valido. Si el dueño quiere "stock negativo" por algun motivo
   * contable, hace dos ajustes (uno positivo seguido del negativo).
   */
  async registrarAjuste(dto: CreateAjusteDto, actor: ActorContext): Promise<MovimientoResponse> {
    const producto = await this.productsService.buscarPorId(dto.productId, actor.userId, {
      incluirInactivos: true,
    });

    const stockAntes = await this.calcularStockNumero(producto.id);
    const stockDespues = stockAntes + dto.cantidad;
    if (stockDespues < 0) {
      throw new BadRequestException(
        `El ajuste dejaria stock negativo. Stock actual: ${stockAntes}, ajuste: ${dto.cantidad}`,
      );
    }

    const movimiento = await this.crearMovimiento({
      tipo: StockMovementType.AJUSTE,
      cantidad: dto.cantidad,
      motivo: dto.motivo,
      nota: dto.nota ?? null,
      productId: producto.id,
      userId: actor.userId,
    });

    this.emitirEventoAnalitico(movimiento, producto, actor);

    return { movimiento, stockActual: stockDespues };
  }

  /**
   * Stock actual + fecha del ultimo movimiento.
   * Calculado en una sola query agregada.
   */
  async calcularStock(productId: string, userId: string): Promise<StockSnapshot> {
    // Validamos ownership antes de exponer datos del producto.
    await this.productsService.buscarPorId(productId, userId, { incluirInactivos: true });

    const result = await this.movimientosRepository
      .createQueryBuilder('m')
      .select(
        `COALESCE(SUM(CASE
          WHEN m.tipo = 'entrada' THEN m.cantidad
          WHEN m.tipo = 'salida'  THEN -m.cantidad
          WHEN m.tipo = 'ajuste'  THEN m.cantidad
        END), 0)`,
        'stock',
      )
      .addSelect('MAX(m.createdAt)', 'ultimo')
      .where('m."productId" = :productId', { productId })
      .getRawOne<{ stock: string; ultimo: Date | null }>();

    return {
      productId,
      stockActual: Number(result?.stock ?? 0),
      ultimoMovimiento: result?.ultimo ?? null,
    };
  }

  /**
   * Historial de movimientos de un producto, paginado y filtrable.
   * Ordenado por fecha descendente (mas reciente primero).
   */
  async obtenerMovimientos(
    productId: string,
    query: QueryMovimientosDto,
    userId: string,
  ): Promise<PaginatedMovimientos> {
    // Validamos que el producto sea del user antes de revelar movimientos.
    await this.productsService.buscarPorId(productId, userId, { incluirInactivos: true });

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.movimientosRepository
      .createQueryBuilder('m')
      .where('m."productId" = :productId', { productId });

    if (query.tipo) {
      qb.andWhere('m.tipo = :tipo', { tipo: query.tipo });
    }
    if (query.desde) {
      qb.andWhere('m."createdAt" >= :desde', { desde: query.desde });
    }
    if (query.hasta) {
      qb.andWhere('m."createdAt" <= :hasta', { hasta: query.hasta });
    }

    qb.orderBy('m."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      lastPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Productos del usuario cuyo stock actual <= stockMinimo.
   *
   * UNA query con LEFT JOIN + GROUP BY + HAVING. La alternativa naive
   * (lista productos + iterar y calcular stock) seria N+1 queries:
   * desastroso si el usuario tiene 200 productos.
   *
   * COALESCE alrededor del SUM: si un producto no tiene movimientos, el
   * LEFT JOIN da NULL en m.cantidad y SUM da NULL. Coalesce lo convierte a 0.
   */
  async obtenerAlertas(userId: string): Promise<AlertaStock[]> {
    const rows = await this.movimientosRepository.manager
      .createQueryBuilder()
      .select('p.id', 'id')
      .addSelect('p.ean13', 'ean13')
      .addSelect('p.nombre', 'nombre')
      .addSelect('p.descripcion', 'descripcion')
      .addSelect('p.categoria', 'categoria')
      .addSelect('p."precioCompra"', 'precioCompra')
      .addSelect('p."precioVenta"', 'precioVenta')
      .addSelect('p."unidadMedida"', 'unidadMedida')
      .addSelect('p."stockMinimo"', 'stockMinimo')
      .addSelect('p."imagenUrl"', 'imagenUrl')
      .addSelect('p.activo', 'activo')
      .addSelect('p."userId"', 'userId')
      .addSelect('p."createdAt"', 'createdAt')
      .addSelect('p."updatedAt"', 'updatedAt')
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN m.tipo = 'entrada' THEN m.cantidad
          WHEN m.tipo = 'salida'  THEN -m.cantidad
          WHEN m.tipo = 'ajuste'  THEN m.cantidad
        END), 0)`,
        'stockActual',
      )
      .from('products', 'p')
      .leftJoin('stock_movements', 'm', 'm."productId" = p.id')
      .where('p."userId" = :userId', { userId })
      .andWhere('p.activo = true')
      .groupBy('p.id')
      .having(
        `COALESCE(SUM(CASE
          WHEN m.tipo = 'entrada' THEN m.cantidad
          WHEN m.tipo = 'salida'  THEN -m.cantidad
          WHEN m.tipo = 'ajuste'  THEN m.cantidad
        END), 0) <= p."stockMinimo"`,
      )
      .orderBy('"stockActual"', 'ASC')
      .getRawMany<RawAlertaRow>();

    return rows.map((row) => {
      const stockActual = Number(row.stockActual);
      const stockMinimo = Number(row.stockMinimo);
      // El driver pg devuelve decimal como string. precioCompra/precioVenta
      // pasan por raw query (sin transformer); los normalizamos a number.
      const producto: Product = {
        id: row.id,
        ean13: row.ean13,
        nombre: row.nombre,
        descripcion: row.descripcion,
        categoria: row.categoria,
        precioCompra: row.precioCompra === null ? null : Number(row.precioCompra),
        precioVenta: row.precioVenta === null ? null : Number(row.precioVenta),
        unidadMedida: row.unidadMedida,
        stockMinimo,
        imagenUrl: row.imagenUrl,
        activo: row.activo,
        userId: row.userId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      return {
        producto,
        stockActual,
        stockMinimo,
        // negativo o cero: stockActual esta en o bajo el minimo.
        diferencia: stockActual - stockMinimo,
      };
    });
  }

  /**
   * Helper interno: solo el numero del stock (sin metadata).
   * Lo usan los registrar* para validar antes de insertar.
   */
  private async calcularStockNumero(productId: string): Promise<number> {
    const result = await this.movimientosRepository
      .createQueryBuilder('m')
      .select(
        `COALESCE(SUM(CASE
          WHEN m.tipo = 'entrada' THEN m.cantidad
          WHEN m.tipo = 'salida'  THEN -m.cantidad
          WHEN m.tipo = 'ajuste'  THEN m.cantidad
        END), 0)`,
        'stock',
      )
      .where('m."productId" = :productId', { productId })
      .getRawOne<{ stock: string }>();
    return Number(result?.stock ?? 0);
  }

  private async crearMovimiento(data: Partial<StockMovement>): Promise<StockMovement> {
    const movimiento = this.movimientosRepository.create(data);
    const guardado = await this.movimientosRepository.save(movimiento);
    // Evento sincrono: el cache de IA escucha y borra predicciones del
    // user (quedan obsoletas tras un cambio de stock). EventEmitter es
    // sync por default; el listener se ejecuta antes de retornar pero
    // su trabajo es solo borrar entries de un Map -> microsegundos.
    if (data.userId) {
      this.eventEmitter.emit(STOCK_MOVIMIENTO_EVENT, {
        userId: data.userId,
      } satisfies StockMovimientoEventPayload);
    }
    return guardado;
  }

  /**
   * Fire-and-forget: emite el evento a MongoDB sin esperar el resultado.
   *
   * - Sin await: si Mongo tarda 5s, no penalizamos al usuario.
   * - .catch silencioso: si Mongo esta caido, logueamos warning y seguimos.
   *   El inventario es la fuente de verdad (PostgreSQL); MongoDB es
   *   analitica complementaria. Si se pierden eventos, se pueden
   *   reconstruir desde stock_movements (mismo schema desnormalizable).
   *
   * Nota: el lint rule no-floating-promises queda exento aqui usando
   * `void` explicito sobre la promise — comunica intencion y silencia el
   * warning de "promise sin await".
   */
  private emitirEventoAnalitico(
    movimiento: StockMovement,
    producto: Product,
    actor: ActorContext,
  ): void {
    void this.analyticsService
      .registrarEvento({
        tipo: movimiento.tipo,
        productoId: producto.id,
        ean13: producto.ean13,
        nombreProducto: producto.nombre,
        cantidad: movimiento.cantidad,
        userId: actor.userId,
        comercioNombre: actor.comercioNombre,
        timestamp: movimiento.createdAt,
      })
      .catch((err: Error) => {
        this.logger.warn(
          `Fallo al emitir evento analitico (movimiento ${movimiento.id}): ${err.message}`,
        );
      });
  }
}

/** Forma cruda de cada fila del query de alertas (todo viene como string). */
interface RawAlertaRow {
  id: string;
  ean13: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precioCompra: string | null;
  precioVenta: string | null;
  unidadMedida: string;
  stockMinimo: string;
  imagenUrl: string | null;
  activo: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  stockActual: string;
}
