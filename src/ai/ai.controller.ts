import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { AiThrottlerGuard } from './ai-throttler.guard';
import { AnalizarTendenciasDto } from './dto/analizar-tendencias.dto';
import { GenerarOrdenDto } from './dto/generar-orden.dto';
import type { AnalisisTendencias, OrdenCompra, PrediccionRestock } from './ai.types';

/**
 * AiController.
 *
 * Politica de acceso: SOLO dueño. Razones:
 * - Las llamadas a Groq cuestan tokens. Limitar a un rol reduce abuso.
 * - Las predicciones son input gerencial — el dueño decide reposicion,
 *   no el empleado de mostrador.
 *
 * Throttling: AiThrottlerGuard rastrea por userId.
 * - corto: 3 / 60s — protege de loops accidentales en frontend.
 * - largo: 30 / 3600s — limite de cuota gratuita de Groq por user.
 */
@ApiTags('ai')
@ApiBearerAuth('JWT')
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard, AiThrottlerGuard)
@Roles(UserRole.DUENO)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('predict-restock')
  @HttpCode(HttpStatus.OK)
  @Throttle({ corto: { limit: 3, ttl: 60_000 }, largo: { limit: 30, ttl: 3600_000 } })
  @ApiOperation({
    summary: 'Predecir reposicion de productos',
    description:
      'Analiza historial de movimientos y predice cuando se agotara cada producto y cuanto reponer.',
  })
  @ApiResponse({ status: 200, description: 'Lista de predicciones (puede estar vacia)' })
  @ApiResponse({ status: 403, description: 'Solo dueño' })
  @ApiResponse({ status: 429, description: 'Rate limit (3/min, 30/hora)' })
  @ApiResponse({ status: 503, description: 'Servicio de IA no disponible' })
  predictRestock(@CurrentUser() user: User): Promise<PrediccionRestock[]> {
    return this.aiService.predecirReposicion(user.id);
  }

  @Post('analyze-trends')
  @HttpCode(HttpStatus.OK)
  @Throttle({ corto: { limit: 3, ttl: 60_000 }, largo: { limit: 30, ttl: 3600_000 } })
  @ApiOperation({
    summary: 'Analizar tendencias y patrones de venta',
    description:
      'Detecta patrones diarios/horarios y emite recomendaciones accionables en español.',
  })
  @ApiResponse({ status: 200, description: 'Analisis con patrones y recomendaciones' })
  analyzeTrends(
    @Body() dto: AnalizarTendenciasDto,
    @CurrentUser() user: User,
  ): Promise<AnalisisTendencias> {
    return this.aiService.analizarTendencias(user.id, {
      desde: dto.desde ? new Date(dto.desde) : undefined,
      hasta: dto.hasta ? new Date(dto.hasta) : undefined,
    });
  }

  @Post('generate-order')
  @HttpCode(HttpStatus.OK)
  @Throttle({ corto: { limit: 3, ttl: 60_000 }, largo: { limit: 30, ttl: 3600_000 } })
  @ApiOperation({
    summary: 'Generar orden de compra sugerida',
    description: 'Items a reponer con cantidades, prioridades y subtotales (si hay precios).',
  })
  generateOrder(@Body() dto: GenerarOrdenDto, @CurrentUser() user: User): Promise<OrdenCompra> {
    return this.aiService.generarOrdenCompra(user.id, {
      diasCobertura: dto.diasCobertura,
    });
  }
}
