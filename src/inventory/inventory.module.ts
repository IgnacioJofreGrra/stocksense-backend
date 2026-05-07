import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { StockMovement } from './entities/stock-movement.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * InventoryModule.
 *
 * Imports:
 * - TypeOrmModule.forFeature([StockMovement]): repositorio de movimientos.
 * - ProductsModule: ProductsService para validar ownership.
 * - AuthModule: guards/decoradores del controller.
 * - AnalyticsModule: AnalyticsService para emitir eventos analiticos
 *   (fire-and-forget). La dependencia es unidireccional Inventory ->
 *   Analytics; AnalyticsModule no conoce a Inventory, asi evitamos
 *   ciclo de imports.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StockMovement]), ProductsModule, AuthModule, AnalyticsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
