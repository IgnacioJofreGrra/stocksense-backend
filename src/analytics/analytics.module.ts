import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent, AnalyticsEventSchema } from './schemas/analytics-event.schema';

/**
 * AnalyticsModule.
 *
 * Imports:
 * - MongooseModule.forFeature([...]): registra el Model<AnalyticsEvent>
 *   contra la conexion de Mongo configurada en AppModule. Es analogo a
 *   TypeOrmModule.forFeature([X]) pero para Mongoose.
 * - AuthModule: necesario por JwtAuthGuard del controller (igual patron
 *   que ProductsModule e InventoryModule).
 *
 * exports: [AnalyticsService] -> InventoryModule lo importa para emitir
 * eventos. La dependencia es unidireccional (Inventory -> Analytics);
 * Analytics no conoce a Inventory.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AnalyticsEvent.name, schema: AnalyticsEventSchema }]),
    AuthModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
