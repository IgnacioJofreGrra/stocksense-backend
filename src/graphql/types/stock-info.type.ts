import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Snapshot del stock de un producto.
 * Equivalente al StockSnapshot interno de InventoryService.
 */
@ObjectType()
export class StockInfo {
  @Field(() => ID)
  productId!: string;

  @Field(() => Int)
  stockActual!: number;

  @Field(() => Date, { nullable: true })
  ultimoMovimiento?: Date | null;
}
