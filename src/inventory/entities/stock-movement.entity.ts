import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Tipos de movimiento de stock.
 *
 * - entrada: ingreso de mercaderia (compra, devolucion de cliente, etc.).
 * - salida:  egreso de mercaderia (venta, devolucion al proveedor, etc.).
 * - ajuste:  correccion manual del stock por el dueño (merma, recuento
 *            fisico, error previo). Solo dueño puede registrar ajustes.
 */
export enum StockMovementType {
  ENTRADA = 'entrada',
  SALIDA = 'salida',
  AJUSTE = 'ajuste',
}

// registerEnumType expone el enum TS al schema GraphQL (no es automatico
// porque GraphQL tiene su propio sistema de enums separado de TS).
registerEnumType(StockMovementType, {
  name: 'StockMovementType',
  description: 'Tipo de movimiento de stock: entrada, salida o ajuste',
});

/**
 * StockMovement: evento inmutable de movimiento de stock.
 *
 * Decisiones criticas:
 *
 * 1. EVENT SOURCING SIMPLE — No existe campo `stockActual` en Product. El
 *    stock se calcula sumando los movimientos:
 *      stock = SUM(cantidad WHERE entrada) - SUM(cantidad WHERE salida)
 *            + SUM(cantidad WHERE ajuste)   // ajuste puede ser negativo
 *    Asi el historial es la fuente de verdad. Si manana descubrimos un bug
 *    en el calculo, recalculamos desde los movimientos sin perder nada.
 *
 * 2. INMUTABILIDAD — Sin @UpdateDateColumn. Sin endpoints PATCH/DELETE.
 *    Si hay un error, se registra un movimiento de tipo `ajuste` para
 *    corregir. Asi el historial queda completo (tanto el error como la
 *    correccion son visibles), util para auditorias.
 *
 * 3. SIN CHECK > 0 EN cantidad — La BD permite cualquier integer. La
 *    validacion de signo por tipo se hace en el DTO/service:
 *    - entrada: cantidad > 0 (aumentar stock)
 *    - salida:  cantidad > 0 (disminuir stock)
 *    - ajuste:  cantidad != 0, signo libre (corrige en cualquier direccion)
 *    No usamos CHECK constraint porque el signo significa cosas distintas
 *    segun el tipo, y no queremos atarnos a SQL si manana cambia la regla.
 *
 * 4. EAGER FALSE en relaciones — calcularStock() puede sumar cientos de
 *    movimientos. Si TypeORM cargara Product y User en cada uno, seria
 *    catastrofico en performance. El controller hidrata solo cuando hace
 *    falta (ej. mostrar movimientos en UI con nombre de producto).
 *
 * 5. onDelete: 'RESTRICT' — No se puede borrar un producto con movimientos.
 *    Como Products usa soft delete (activo=false), esto es la red de
 *    seguridad: si alguien intenta borrar fisicamente, la BD frena.
 */
@ObjectType('StockMovement')
@Entity('stock_movements')
@Index(['productId', 'createdAt'])
@Index(['userId'])
export class StockMovement {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => StockMovementType)
  @Column({ type: 'enum', enum: StockMovementType })
  tipo!: StockMovementType;

  @Field(() => Int)
  @Column({ type: 'integer' })
  cantidad!: number;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  motivo!: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  nota!: string | null;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Field(() => ID)
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
