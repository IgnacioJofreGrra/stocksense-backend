import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../common/transformers/numeric.transformer';
import { User } from '../../users/entities/user.entity';

/**
 * Entidad Product.
 *
 * Decisiones:
 * - @Unique(['ean13', 'userId']): unique compuesto. Dos comercios distintos
 *   pueden tener el mismo EAN-13 (mismo producto vendido por dos almacenes).
 *   El constraint a nivel BD evita race conditions: si dos requests del
 *   mismo user crean el mismo EAN simultaneamente, uno falla con error de
 *   constraint en lugar de quedar duplicado.
 *
 * - @ManyToOne(() => User) + columna userId separada: TypeORM permite tener
 *   la FK como columna explicita Y la relacion. La columna sirve para queries
 *   `WHERE userId = ?`; la relacion para hidratar product.user cuando se pida.
 *   onDelete: 'CASCADE' -> si se elimina el user, sus productos van con el.
 *
 * - precioCompra/precioVenta usan numericTransformer: el driver pg devuelve
 *   decimal como string; el transformer lo convierte a number al leer.
 *
 * - activo (boolean) en lugar de @DeleteDateColumn: mas explicito en queries
 *   (`WHERE activo = true`) que el soft-delete nativo de TypeORM, que oculta
 *   filas pero requiere `withDeleted` para verlas.
 */
@ObjectType('Product')
@Entity('products')
@Unique(['ean13', 'userId'])
@Index(['userId'])
export class Product {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column({ type: 'varchar', length: 13 })
  ean13!: string;

  @Field()
  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria!: string | null;

  // GraphQL no tiene tipo decimal nativo; Float es lo mas cercano. La
  // precision la mantiene el numericTransformer en BD.
  @Field(() => Float, { nullable: true })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  precioCompra!: number | null;

  @Field(() => Float, { nullable: true })
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  precioVenta!: number | null;

  @Field()
  @Column({ type: 'varchar', length: 20, default: 'unidad' })
  unidadMedida!: string;

  @Field(() => Int)
  @Column({ type: 'integer', default: 5 })
  stockMinimo!: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  imagenUrl!: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  userId!: string;

  // No exponemos `user` por GraphQL: si lo necesitamos, mejor un
  // @ResolveField que se hidrate solo cuando lo pidan.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
