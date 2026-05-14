import { Field, ObjectType } from '@nestjs/graphql';
import { Product } from '../../products/entities/product.entity';

@ObjectType()
export class SugerenciaOff {
  @Field(() => String, { nullable: true })
  nombre!: string | null;

  @Field(() => String, { nullable: true })
  marca!: string | null;

  @Field(() => String, { nullable: true })
  categoria!: string | null;

  @Field(() => String, { nullable: true })
  imagenUrl!: string | null;
}

@ObjectType()
export class ResultadoEscaner {
  @Field(() => String)
  fuente!: 'local' | 'off' | 'desconocido';

  @Field(() => Product, { nullable: true })
  producto!: Product | null;

  @Field(() => SugerenciaOff, { nullable: true })
  sugerenciaOff!: SugerenciaOff | null;
}
