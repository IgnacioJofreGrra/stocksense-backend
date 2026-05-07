import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsEan13 } from '../../common/validators/ean13.validator';

/**
 * DTO de creacion de producto.
 *
 * - userId NO esta aqui: viene del JWT en el controller via @CurrentUser().
 *   Si el cliente lo enviara, ValidationPipe (whitelist) lo descarta.
 * - activo NO esta aqui: por default true (entidad). El campo se cambia
 *   solo via DELETE (soft delete) o PATCH explicito.
 * - precioCompra/precioVenta opcionales: el dueño puede registrar productos
 *   sin precio aun (por ej. apenas escanea para inventariar) y completarlos
 *   despues con PATCH.
 */
export class CreateProductDto {
  @IsEan13()
  ean13!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @IsPositive()
  precioCompra?: number;

  @IsOptional()
  @IsPositive()
  precioVenta?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadMedida?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imagenUrl?: string;
}
