import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Tipos de respuesta para los queries de analitica.
 * Reflejan 1:1 las interfaces que ya devuelve AnalyticsService.
 */

@ObjectType()
export class ProductoMasVendido {
  @Field(() => ID)
  productoId!: string;

  @Field()
  ean13!: string;

  @Field()
  nombreProducto!: string;

  @Field(() => Int)
  totalVendido!: number;

  @Field(() => Int)
  cantidadMovimientos!: number;
}

@ObjectType()
export class VentasPorDia {
  @Field(() => Int)
  diaSemana!: number;

  @Field()
  nombreDia!: string;

  @Field(() => Int)
  totalVentas!: number;
}

@ObjectType()
export class VentasPorHora {
  @Field(() => Int)
  hora!: number;

  @Field(() => Int)
  totalVentas!: number;
}

@ObjectType()
export class TendenciaPunto {
  @Field()
  periodo!: string; // ej "2026-05"

  @Field(() => Int)
  totalMovimientos!: number;

  @Field(() => Int)
  cantidadTotal!: number;
}

@ObjectType()
export class ResumenPeriodo {
  @Field(() => Int)
  totalEntradas!: number;

  @Field(() => Int)
  totalSalidas!: number;

  @Field(() => Int)
  productosUnicos!: number;

  @Field(() => Int)
  movimientosTotales!: number;

  @Field(() => Float)
  promedioDiarioVentas!: number;
}
