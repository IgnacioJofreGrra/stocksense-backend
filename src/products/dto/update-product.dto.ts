import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

/**
 * DTO de actualizacion. Todos los campos opcionales (PATCH parcial).
 *
 * PartialType: utility de @nestjs/mapped-types que toma todos los campos
 * de CreateProductDto y los marca opcionales. Asi no duplicamos validaciones
 * y si manana cambia CreateProductDto, UpdateProductDto se ajusta solo.
 *
 * Nota: PartialType preserva los decoradores de class-validator (incluido
 * @IsEan13). Si el cliente manda un ean13 nuevo, igual pasa por la validacion
 * del digito verificador.
 *
 * `activo` se agrega aparte (no esta en CreateProductDto) para permitir
 * reactivar productos soft-deleted: PATCH /products/:id { activo: true }.
 * El service maneja el caso especial de buscar incluyendo desactivados.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
