import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Campos validos para ordenar resultados.
 *
 * Lista cerrada por seguridad: si aceptaramos cualquier string, un atacante
 * podria probar `?orderBy=password` y, aunque la columna no existe en
 * `products`, la query fallaria con un mensaje que filtra detalles del
 * schema. Mejor restringir desde el DTO.
 */
export enum ProductOrderBy {
  NOMBRE = 'nombre',
  CREATED_AT = 'createdAt',
  PRECIO_VENTA = 'precioVenta',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * DTO de query string para GET /products.
 *
 * @Type(() => Number/Boolean): los query strings llegan siempre como string
 * ("page=1" -> "1"). Sin @Type, IsInt fallaria. ValidationPipe con
 * transform:true usa class-transformer para coerce.
 *
 * @Transform en activo: convierte 'true'/'false' string a boolean. IsBoolean
 * solo no basta porque viene como string del query.
 */
export class QueryProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean = true;

  @IsOptional()
  @IsEnum(ProductOrderBy)
  orderBy?: ProductOrderBy = ProductOrderBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.ASC;
}
