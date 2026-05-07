import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { AnalyticsService, RangoOpciones } from '../../analytics/analytics.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../users/entities/user.entity';
import { DateRangeInput } from '../inputs/date-range.input';
import {
  ProductoMasVendido,
  ResumenPeriodo,
  TendenciaPunto,
  VentasPorDia,
  VentasPorHora,
} from '../types/analytics.types';

/**
 * AnalyticsResolver — queries de analitica via GraphQL.
 *
 * Reusa AnalyticsService 1:1 (los mismos pipelines de agregacion MongoDB
 * que ya tenemos en REST). Solo wrap + conversion de fechas.
 */
@Resolver()
@UseGuards(JwtAuthGuard)
export class AnalyticsResolver {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Query(() => [ProductoMasVendido], { name: 'productosMasVendidos' })
  productosMasVendidos(
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<ProductoMasVendido[]> {
    return this.analyticsService.productosMasVendidos(user.id, this.toOpciones(opciones));
  }

  @Query(() => [VentasPorDia], { name: 'ventasPorDia' })
  ventasPorDia(
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<VentasPorDia[]> {
    return this.analyticsService.ventasPorDiaSemana(user.id, this.toOpciones(opciones));
  }

  @Query(() => [VentasPorHora], { name: 'ventasPorHora' })
  ventasPorHora(
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<VentasPorHora[]> {
    return this.analyticsService.ventasPorHora(user.id, this.toOpciones(opciones));
  }

  @Query(() => [TendenciaPunto], { name: 'tendenciaProducto' })
  tendenciaProducto(
    @Args('productoId', { type: () => ID }) productoId: string,
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<TendenciaPunto[]> {
    return this.analyticsService.tendenciaProducto(productoId, user.id, this.toOpciones(opciones));
  }

  @Query(() => ResumenPeriodo, { name: 'resumenPeriodo' })
  resumenPeriodo(
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<ResumenPeriodo> {
    return this.analyticsService.resumenPeriodo(user.id, this.toOpciones(opciones));
  }

  /**
   * Convierte el DateRangeInput (con strings ISO) a las opciones del
   * service (con Date). Idem al toOpciones del AnalyticsController REST.
   */
  private toOpciones(input: DateRangeInput | undefined): RangoOpciones {
    if (!input) return {};
    return {
      desde: input.desde ? new Date(input.desde) : undefined,
      hasta: input.hasta ? new Date(input.hasta) : undefined,
      limite: input.limite,
    };
  }
}
