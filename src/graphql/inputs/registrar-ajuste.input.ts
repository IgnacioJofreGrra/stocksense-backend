import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

@InputType()
export class RegistrarAjusteInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => Int)
  @IsInt()
  @NotEquals(0, { message: 'El ajuste no puede ser cero' })
  cantidad!: number;

  // Motivo obligatorio en ajustes (audit trail) — igual que el DTO REST.
  @Field()
  @IsString()
  @MinLength(3, { message: 'El motivo del ajuste debe tener al menos 3 caracteres' })
  @MaxLength(50)
  motivo!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
