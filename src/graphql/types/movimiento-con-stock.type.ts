import { Field, Int, ObjectType } from '@nestjs/graphql';
import { StockMovement } from '../../inventory/entities/stock-movement.entity';

/**
 * Respuesta enriquecida de las mutations registrarEntrada/Salida/Ajuste.
 * Devuelve el movimiento creado + el stock recalculado, asi el cliente
 * no necesita un round-trip extra para refrescar la UI.
 */
@ObjectType()
export class MovimientoConStock {
  @Field(() => StockMovement)
  movimiento!: StockMovement;

  @Field(() => Int)
  stockActual!: number;
}
