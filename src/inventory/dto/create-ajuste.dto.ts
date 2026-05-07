import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

/**
 * DTO para registrar un ajuste manual de stock.
 *
 * Diferencias con entrada/salida:
 * - cantidad puede ser positiva o negativa, pero no cero. Positiva agrega
 *   stock (ej. encontre 3 unidades olvidadas); negativa quita (merma, robo,
 *   recuento corregido).
 * - motivo es OBLIGATORIO con minimo 3 caracteres. Auditoria: si alguien
 *   ajusta el stock sin razon, queda registro vacio. Forzar motivo evita
 *   ajustes "fantasma" y crea un audit trail util si manana hay sospechas
 *   de robo interno.
 */
export class CreateAjusteDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @NotEquals(0, { message: 'El ajuste no puede ser cero' })
  cantidad!: number;

  @IsString()
  @MinLength(3, { message: 'El motivo del ajuste debe tener al menos 3 caracteres' })
  @MaxLength(50)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
