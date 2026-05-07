import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * DTO para registrar una salida de stock (tipicamente una venta).
 *
 * cantidad >= 1: salida implica egreso. La validacion contra stock disponible
 * se hace en el service (no se puede expresar en class-validator).
 */
export class CreateSalidaDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1, { message: 'La cantidad de una salida debe ser al menos 1' })
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
