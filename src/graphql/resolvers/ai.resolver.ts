import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { AiThrottlerGuard } from '../../ai/ai-throttler.guard';
import { AiService } from '../../ai/ai.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { User, UserRole } from '../../users/entities/user.entity';
import { DateRangeInput } from '../inputs/date-range.input';
import { AnalisisTendenciasGql, OrdenCompraGql, PrediccionRestockGql } from '../types/ai.types';

/**
 * AiResolver — expone los 3 endpoints IA tambien por GraphQL.
 *
 * Reusa AiService 1:1 (mismo cache, mismo rate limit). Aplicamos los
 * mismos guards: JWT + Roles(DUENO) + AiThrottler.
 *
 * Son Queries (no Mutations) porque la IA SOLO consulta — nunca modifica
 * datos. Aunque el nombre "generarOrdenCompra" parezca mutation, el
 * resultado es un objeto sugerido; el usuario decide registrarlo aparte.
 */
@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard, AiThrottlerGuard)
@Roles(UserRole.DUENO)
export class AiResolver {
  constructor(private readonly aiService: AiService) {}

  @Query(() => [PrediccionRestockGql], { name: 'predecirReposicion' })
  predecirReposicion(@CurrentUser() user: User): Promise<PrediccionRestockGql[]> {
    return this.aiService.predecirReposicion(user.id);
  }

  @Query(() => AnalisisTendenciasGql, { name: 'analizarTendencias' })
  analizarTendencias(
    @Args('opciones', { type: () => DateRangeInput, nullable: true })
    opciones: DateRangeInput | undefined,
    @CurrentUser() user: User,
  ): Promise<AnalisisTendenciasGql> {
    return this.aiService.analizarTendencias(user.id, {
      desde: opciones?.desde ? new Date(opciones.desde) : undefined,
      hasta: opciones?.hasta ? new Date(opciones.hasta) : undefined,
    });
  }

  @Query(() => OrdenCompraGql, { name: 'generarOrdenCompra' })
  generarOrdenCompra(
    @Args('diasCobertura', { type: () => Int, nullable: true })
    diasCobertura: number | undefined,
    @CurrentUser() user: User,
  ): Promise<OrdenCompraGql> {
    return this.aiService.generarOrdenCompra(user.id, { diasCobertura });
  }
}
