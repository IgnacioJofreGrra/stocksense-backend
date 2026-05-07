import { Field, Int, ObjectType } from '@nestjs/graphql';
import { StockMovement } from '../../inventory/entities/stock-movement.entity';
import { Product } from '../../products/entities/product.entity';

/**
 * Wrappers de paginacion para queries que retornan listas grandes.
 *
 * Decision: tipos especificos por entidad (no un generico Paginated<T>).
 * Razon: GraphQL code-first no soporta generics nativamente; cada tipo
 * concreto tiene que existir en el schema. Crear un helper generico con
 * createUnionType o factories es over-engineering para 2 listas.
 */
@ObjectType()
export class PaginatedProducts {
  @Field(() => [Product])
  data!: Product[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  lastPage!: number;
}

@ObjectType()
export class PaginatedMovimientos {
  @Field(() => [StockMovement])
  data!: StockMovement[];

  @Field(() => Int)
  total!: number;

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  lastPage!: number;
}
