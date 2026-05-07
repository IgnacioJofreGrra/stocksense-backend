import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Product } from '../../products/entities/product.entity';

/**
 * Producto cuyo stock cayo al o bajo el minimo.
 * Lo usan: query alertasStock + subscription alertaStockBajo.
 */
@ObjectType()
export class AlertaStock {
  @Field(() => Product)
  producto!: Product;

  @Field(() => Int)
  stockActual!: number;

  @Field(() => Int)
  stockMinimo!: number;

  // Negativa si el stock esta debajo del minimo (cuanto falta);
  // 0 si esta justo en el minimo.
  @Field(() => Int)
  diferencia!: number;
}
