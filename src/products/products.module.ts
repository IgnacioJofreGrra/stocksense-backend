import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { OpenFoodFactsService } from './open-food-facts.service';
/**
 * ProductsModule.
 *
 * - TypeOrmModule.forFeature([Product]) registra el repositorio de Product.
 *   Como AppModule ya tiene autoLoadEntities:true, no hace falta agregar
 *   Product al config global; con esta linea sola TypeORM la carga.
 *
 * - AuthModule importado por los guards (JwtAuthGuard, RolesGuard) y el
 *   decorador @CurrentUser que se usan en el controller. Especificamente,
 *   JwtStrategy (provista por AuthModule) es la que valida el token y
 *   pobla request.user.
 *
 * No importamos UsersModule directamente: ProductsService no necesita
 * UsersService. El user llega ya hidratado por el guard.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Product]), AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, OpenFoodFactsService],
  exports: [ProductsService, OpenFoodFactsService],
})
export class ProductsModule {}
