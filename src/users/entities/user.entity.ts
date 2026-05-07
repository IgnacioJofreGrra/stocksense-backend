import { Field, HideField, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Roles del sistema.
 *
 * Usamos string-enum (no numerico) para que en la BD se vea legible:
 * `SELECT rol FROM users` -> 'dueno' | 'empleado'.
 */
export enum UserRole {
  DUENO = 'dueno',
  EMPLEADO = 'empleado',
}

registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'Rol del usuario en el sistema (dueño o empleado)',
});

/**
 * Entidad User.
 *
 * Decisiones:
 * - id como UUID en lugar de int autoincremental: evita exposicion de
 *   cardinalidad ("hay 47 usuarios") y permite generarlos en cliente.
 * - email con @Index unique: la BD garantiza unicidad ademas de la app.
 * - password se guarda como hash bcrypt (nunca en texto plano).
 * - refreshToken es nullable y se guarda hasheado tambien (no es secret leak
 *   si la BD se filtra: el atacante igual no puede usarlo en /auth/refresh).
 * - comercioNombre como string: en esta version 1 user = 1 comercio. Si
 *   escala a multi-comercio por user, se extrae a entidad Comercio.
 */
@ObjectType('User')
@Entity('users')
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  // @HideField: la columna existe en BD pero NO aparece en el schema
  // GraphQL. Imposible que el cliente la pida. Equivalente declarativo
  // del destructuring `toSafeUser` en AuthService.
  @HideField()
  @Column({ type: 'varchar', length: 255 })
  password!: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Field(() => UserRole)
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.EMPLEADO,
  })
  rol!: UserRole;

  @Field()
  @Column({ type: 'varchar', length: 150 })
  comercioNombre!: string;

  @Field()
  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @HideField()
  @Column({ type: 'varchar', length: 255, nullable: true })
  refreshToken!: string | null;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
