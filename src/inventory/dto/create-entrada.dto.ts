import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * DTO para registrar una entrada de stock.
 *
 * - cantidad >= 1: una "entrada" implica ingreso. cantidad 0 no aporta;
 *   cantidad negativa seria un ajuste (otro endpoint, otro DTO).
 * - motivo opcional: por default se entiende "compra". El cliente puede
 *   sobreescribir con "devolucion cliente", "donacion", etc.
 */
export class CreateEntradaDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1, { message: 'La cantidad de una entrada debe ser al menos 1' })
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
