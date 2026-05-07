import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * ObjectTypes GraphQL para los resultados de IA.
 * Reflejan 1:1 las interfaces TS de src/ai/ai.types.ts.
 *
 * Decision: enums urgencia/prioridad como string (no GraphQL enums) — los
 * valores los pone el LLM en el output y un enum cerrado puede causar
 * fallos si el modelo se desboca. Defendimos en la capa de validacion;
 * aqui dejamos string permisivo.
 */

@ObjectType()
export class PrediccionRestockGql {
  @Field(() => ID)
  productoId!: string;

  @Field()
  nombre!: string;

  @Field()
  ean13!: string;

  @Field(() => Int)
  stockActual!: number;

  @Field(() => Float)
  consumoPromedioDiario!: number;

  @Field(() => Int)
  diasHastaAgotamiento!: number;

  @Field(() => Int)
  cantidadSugeridaReponer!: number;

  @Field()
  urgencia!: string;

  @Field()
  razonamiento!: string;
}

@ObjectType()
export class PatronDiarioGql {
  @Field()
  dia!: string;

  @Field()
  insight!: string;

  @Field()
  relevancia!: string;
}

@ObjectType()
export class PatronHorarioGql {
  @Field()
  franja!: string;

  @Field()
  insight!: string;
}

@ObjectType()
export class ProductoDestacadoGql {
  @Field()
  nombre!: string;

  @Field()
  patron!: string;
}

@ObjectType()
export class AnalisisTendenciasGql {
  @Field(() => [PatronDiarioGql])
  patronesDiarios!: PatronDiarioGql[];

  @Field(() => [PatronHorarioGql])
  patronesHorarios!: PatronHorarioGql[];

  @Field(() => [ProductoDestacadoGql])
  productosDestacados!: ProductoDestacadoGql[];

  @Field(() => [String])
  recomendaciones!: string[];

  @Field()
  resumenGeneral!: string;
}

@ObjectType()
export class ItemOrdenGql {
  @Field(() => ID)
  productoId!: string;

  @Field()
  nombre!: string;

  @Field()
  ean13!: string;

  @Field(() => Int)
  cantidadSugerida!: number;

  @Field(() => Float, { nullable: true })
  precioUnitarioEstimado!: number | null;

  @Field(() => Float, { nullable: true })
  subtotalEstimado!: number | null;

  @Field()
  prioridad!: string;

  @Field()
  motivo!: string;
}

@ObjectType()
export class OrdenCompraGql {
  @Field(() => [ItemOrdenGql])
  items!: ItemOrdenGql[];

  @Field(() => Float, { nullable: true })
  totalEstimado!: number | null;

  @Field()
  notas!: string;

  @Field()
  fechaSugerida!: string;
}
