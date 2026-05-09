import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { AiCacheService } from './ai-cache.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GroqProvider } from './groq.provider';

/**
 * AiModule.
 *
 * Dependencias de los services existentes:
 * - ProductsService -> listar productos del usuario.
 * - InventoryService -> calcularStock, obtenerMovimientos, obtenerAlertas.
 * - AnalyticsService -> agregaciones MongoDB para tendencias.
 *
 * Reglas del Throttler (por user via AiThrottlerGuard):
 * - corto: 3 / 60s — frena loops accidentales del frontend.
 * - largo: 30 / 3600s — protege la cuota de Groq.
 */
@Module({
  imports: [
    ProductsModule,
    InventoryModule,
    AnalyticsModule,
    AuthModule,
    ThrottlerModule.forRoot([
      { name: 'corto', ttl: 60_000, limit: 3 },
      { name: 'largo', ttl: 3600_000, limit: 30 },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, AiCacheService, GroqProvider],
  exports: [AiService, AiCacheService],
})
export class AiModule {}
