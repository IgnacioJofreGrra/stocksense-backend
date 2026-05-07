import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateAjusteDto } from './dto/create-ajuste.dto';
import { CreateEntradaDto } from './dto/create-entrada.dto';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { QueryMovimientosDto } from './dto/query-movimientos.dto';
import {
  ActorContext,
  AlertaStock,
  InventoryService,
  MovimientoResponse,
  PaginatedMovimientos,
  StockSnapshot,
} from './inventory.service';

/** Pequeño helper: arma el ActorContext desde el User del JWT. */
const toActor = (user: User): ActorContext => ({
  userId: user.id,
  comercioNombre: user.comercioNombre,
});

/**
 * InventoryController.
 *
 * Politica de acceso:
 * - Entradas: cualquier user autenticado (el empleado registra compras).
 * - Salidas:  cualquier user autenticado (el empleado vende).
 * - Ajustes:  SOLO dueño. Auditoria + responsabilidad: si hay correcciones,
 *   queda claro quien las autoriza.
 * - Lecturas (stock, movimientos, alertas): cualquier user autenticado.
 *
 * Responses enriquecidas: los endpoints de escritura devuelven el movimiento
 * + el stockActual recalculado. Asi el frontend muestra el stock nuevo sin
 * un round-trip extra.
 */
@ApiTags('inventory')
@ApiBearerAuth('JWT')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('entrada')
  @ApiOperation({ summary: 'Registrar entrada de stock (compra, devolucion cliente)' })
  @ApiResponse({ status: 201, description: 'Movimiento creado y stock actualizado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado o desactivado' })
  registrarEntrada(
    @Body() dto: CreateEntradaDto,
    @CurrentUser() user: User,
  ): Promise<MovimientoResponse> {
    return this.inventoryService.registrarEntrada(dto, toActor(user));
  }

  @Post('salida')
  @ApiOperation({ summary: 'Registrar salida de stock (venta)' })
  @ApiResponse({ status: 201, description: 'Movimiento creado y stock actualizado' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado o desactivado' })
  registrarSalida(
    @Body() dto: CreateSalidaDto,
    @CurrentUser() user: User,
  ): Promise<MovimientoResponse> {
    return this.inventoryService.registrarSalida(dto, toActor(user));
  }

  @Post('ajuste')
  @Roles(UserRole.DUENO)
  @ApiOperation({
    summary: 'Ajuste manual de stock (positivo o negativo, solo dueño)',
    description:
      'Permite operar sobre productos desactivados (correccion historica). El motivo es obligatorio.',
  })
  @ApiResponse({ status: 201, description: 'Ajuste creado y stock actualizado' })
  @ApiResponse({ status: 400, description: 'El ajuste dejaria stock negativo' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (no dueño)' })
  registrarAjuste(
    @Body() dto: CreateAjusteDto,
    @CurrentUser() user: User,
  ): Promise<MovimientoResponse> {
    return this.inventoryService.registrarAjuste(dto, toActor(user));
  }

  @Get('alertas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Productos del usuario cuyo stock actual <= stockMinimo',
    description: 'Solo lista productos activos. Calculado en una sola query agregada.',
  })
  obtenerAlertas(@CurrentUser() user: User): Promise<AlertaStock[]> {
    // Definida ANTES de stock/:productId y movimientos/:productId. Aunque
    // 'alertas' no choca semanticamente con un UUID (ParseUUIDPipe rechazaria),
    // tener las rutas estaticas arriba evita ambigüedades.
    return this.inventoryService.obtenerAlertas(user.id);
  }

  @Get('stock/:productId')
  @ApiOperation({ summary: 'Stock actual + fecha del ultimo movimiento' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  obtenerStock(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: User,
  ): Promise<StockSnapshot> {
    return this.inventoryService.calcularStock(productId, user.id);
  }

  @Get('movimientos/:productId')
  @ApiOperation({ summary: 'Historial paginado de movimientos del producto' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  obtenerMovimientos(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: QueryMovimientosDto,
    @CurrentUser() user: User,
  ): Promise<PaginatedMovimientos> {
    return this.inventoryService.obtenerMovimientos(productId, query, user.id);
  }
}
