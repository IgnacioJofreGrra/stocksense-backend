import { Inject, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ActorContext, InventoryService } from '../../inventory/inventory.service';
import { User, UserRole } from '../../users/entities/user.entity';
import { QueryMovimientosInput } from '../inputs/query-movimientos.input';
import { RegistrarAjusteInput } from '../inputs/registrar-ajuste.input';
import { RegistrarEntradaInput } from '../inputs/registrar-entrada.input';
import { RegistrarSalidaInput } from '../inputs/registrar-salida.input';
import { ALERTA_STOCK_BAJO_TRIGGER, PUB_SUB } from '../pubsub/pubsub.constants';
import { AlertaStock } from '../types/alerta-stock.type';
import { MovimientoConStock } from '../types/movimiento-con-stock.type';
import { PaginatedMovimientos } from '../types/paginated.types';
import { StockInfo } from '../types/stock-info.type';

/**
 * Helper local: arma el ActorContext desde la User del JWT.
 * Igual al toActor del InventoryController REST.
 */
const toActor = (user: User): ActorContext => ({
  userId: user.id,
  comercioNombre: user.comercioNombre,
});

/**
 * InventoryResolver — queries, mutations y la subscription de alertas.
 */
@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryResolver {
  constructor(
    private readonly inventoryService: InventoryService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  // ===== QUERIES =====

  @Query(() => StockInfo, { name: 'stockProducto' })
  async stockProducto(
    @Args('productId', { type: () => ID }) productId: string,
    @CurrentUser() user: User,
  ): Promise<StockInfo> {
    const snapshot = await this.inventoryService.calcularStock(productId, user.id);
    return {
      productId: snapshot.productId,
      stockActual: snapshot.stockActual,
      ultimoMovimiento: snapshot.ultimoMovimiento,
    };
  }

  @Query(() => [AlertaStock], { name: 'alertasStock' })
  async alertasStock(@CurrentUser() user: User): Promise<AlertaStock[]> {
    const alertas = await this.inventoryService.obtenerAlertas(user.id);
    return alertas.map((a) => ({
      producto: a.producto,
      stockActual: a.stockActual,
      stockMinimo: a.stockMinimo,
      diferencia: a.diferencia,
    }));
  }

  @Query(() => PaginatedMovimientos, { name: 'movimientosProducto' })
  movimientosProducto(
    @Args('productId', { type: () => ID }) productId: string,
    @Args('query', { type: () => QueryMovimientosInput, nullable: true })
    query: QueryMovimientosInput | undefined,
    @CurrentUser() user: User,
  ): Promise<PaginatedMovimientos> {
    return this.inventoryService.obtenerMovimientos(productId, query ?? {}, user.id);
  }

  // ===== MUTATIONS =====

  @Mutation(() => MovimientoConStock, { name: 'registrarEntrada' })
  registrarEntrada(
    @Args('input') input: RegistrarEntradaInput,
    @CurrentUser() user: User,
  ): Promise<MovimientoConStock> {
    return this.inventoryService.registrarEntrada(input, toActor(user));
  }

  @Mutation(() => MovimientoConStock, { name: 'registrarSalida' })
  registrarSalida(
    @Args('input') input: RegistrarSalidaInput,
    @CurrentUser() user: User,
  ): Promise<MovimientoConStock> {
    return this.inventoryService.registrarSalida(input, toActor(user));
  }

  @Mutation(() => MovimientoConStock, { name: 'registrarAjuste' })
  @Roles(UserRole.DUENO)
  registrarAjuste(
    @Args('input') input: RegistrarAjusteInput,
    @CurrentUser() user: User,
  ): Promise<MovimientoConStock> {
    return this.inventoryService.registrarAjuste(input, toActor(user));
  }

  // ===== SUBSCRIPTION =====

  /**
   * Subscription que emite cuando un producto cae al o bajo el stockMinimo.
   *
   * filter: solo emite al usuario suscrito que es dueño del producto. El
   * payload trae { alertaStockBajo, _meta: { userId } }; comparamos con
   * context.req.user.id para filtrar por comercio. Sin esto, todos los
   * comercios verian las alertas de los demas — fuga de datos cruzados.
   *
   * resolve: extrae el campo del payload (porque puse _meta para el filter
   * y ese _meta no debe llegar al cliente).
   *
   * Auth: JwtAuthGuard funciona sobre subscriptions porque el AppModule
   * normaliza el context para que el guard encuentre headers.authorization
   * tanto en HTTP como en WS (desde connectionParams).
   */
  @Subscription(() => AlertaStock, {
    name: 'alertaStockBajo',
    description: 'Se dispara al hacer una salida que deja stock <= stockMinimo',
    filter: (
      payload: { _meta: { userId: string } },
      _vars: unknown,
      context: { req: { user: User } },
    ) => payload._meta.userId === context.req.user.id,
    resolve: (payload: { alertaStockBajo: AlertaStock }) => payload.alertaStockBajo,
  })
  alertaStockBajo() {
    return this.pubSub.asyncIterableIterator(ALERTA_STOCK_BAJO_TRIGGER);
  }
}
