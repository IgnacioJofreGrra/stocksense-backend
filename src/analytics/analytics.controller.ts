import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';
import {
  AnalyticsService,
  ProductoMasVendido,
  RangoOpciones,
  ResumenPeriodo,
  TendenciaPunto,
  VentasPorDia,
  VentasPorHora,
} from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';

// Endpoints REST que envuelven AnalyticsService. El service tambien lo
// consumen los resolvers GraphQL — por eso la logica vive aparte.
// Acceso: JWT. Sin RolesGuard, los datos ya estan filtrados por userId.
@ApiTags('analytics')
@ApiBearerAuth('JWT')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('productos-mas-vendidos')
  @ApiOperation({
    summary: 'Top productos por volumen de salidas en el rango',
    description: 'Ordenado descendente por totalVendido. limite default 10.',
  })
  productosMasVendidos(
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: User,
  ): Promise<ProductoMasVendido[]> {
    return this.analyticsService.productosMasVendidos(user.id, this.toOpciones(query));
  }

  @Get('ventas-por-dia')
  @ApiOperation({ summary: 'Distribucion de ventas por dia de la semana' })
  ventasPorDiaSemana(
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: User,
  ): Promise<VentasPorDia[]> {
    return this.analyticsService.ventasPorDiaSemana(user.id, this.toOpciones(query));
  }

  @Get('ventas-por-hora')
  @ApiOperation({ summary: 'Distribucion de ventas por hora (0-23)' })
  ventasPorHora(
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: User,
  ): Promise<VentasPorHora[]> {
    return this.analyticsService.ventasPorHora(user.id, this.toOpciones(query));
  }

  @Get('tendencia/:productoId')
  @ApiOperation({ summary: 'Tendencia mensual de un producto especifico' })
  tendenciaProducto(
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: User,
  ): Promise<TendenciaPunto[]> {
    return this.analyticsService.tendenciaProducto(productoId, user.id, this.toOpciones(query));
  }

  @Get('resumen')
  @ApiOperation({
    summary: 'Resumen general del periodo (totales y promedio diario)',
    description: 'Pensado para tarjetas tipo KPI en el dashboard.',
  })
  resumenPeriodo(
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: User,
  ): Promise<ResumenPeriodo> {
    return this.analyticsService.resumenPeriodo(user.id, this.toOpciones(query));
  }

  /**
   * Convierte el DTO con strings ISO a Date. Lo hacemos aca y no en el DTO
   * porque @IsDateString valida formato pero deja el valor como string,
   * que es lo correcto a la entrada. La conversion es responsabilidad del
   * controller (capa de transporte).
   */
  private toOpciones(query: QueryAnalyticsDto): RangoOpciones {
    return {
      desde: query.desde ? new Date(query.desde) : undefined,
      hasta: query.hasta ? new Date(query.hasta) : undefined,
      limite: query.limite,
    };
  }
}
