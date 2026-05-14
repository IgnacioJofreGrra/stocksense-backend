import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { AiModule } from '../ai/ai.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { StockAlertListener } from './pubsub/stock-alert.listener';
import { PUB_SUB } from './pubsub/pubsub.constants';
import { AiResolver } from './resolvers/ai.resolver';
import { AnalyticsResolver } from './resolvers/analytics.resolver';
import { InventoryResolver } from './resolvers/inventory.resolver';
import { ProductsResolver } from './resolvers/products.resolver';
import { ProductsService } from '../products/products.service';
import { OpenFoodFactsService } from '../products/open-food-facts.service';

/**
 * GraphqlResolversModule.
 *
 * Imports:
 * - ProductsModule, InventoryModule, AnalyticsModule, AiModule: traen
 *   los services ya exportados. Cero duplicacion de logica.
 * - AuthModule: para que JwtStrategy / JwtAuthGuard puedan validar tokens
 *   en queries y subscriptions.
 *
 * Providers:
 * - PUB_SUB (token): instancia singleton de PubSub in-memory para las
 *   subscriptions. En el futuro, swappear por RedisPubSub cuando escalemos
 *   a multiples instancias del backend (sin tocar resolvers).
 * - StockAlertListener: bridge EventEmitter -> PubSub.
 */
@Module({
  imports: [ProductsModule, InventoryModule, AnalyticsModule, AiModule, AuthModule],
  providers: [
    ProductsResolver,
    InventoryResolver,
    AnalyticsResolver,
    AiResolver,
    StockAlertListener,
    ProductsService,
    OpenFoodFactsService,
    {
      provide: PUB_SUB,
      useFactory: () => new PubSub(),
    },
  ],
})
export class GraphqlResolversModule {}
