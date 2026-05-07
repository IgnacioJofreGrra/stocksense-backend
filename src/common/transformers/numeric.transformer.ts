import { ValueTransformer } from 'typeorm';

/**
 * Convierte columnas decimal/numeric de Postgres entre `string` (driver pg)
 * y `number` (codigo de la app).
 *
 * Por que: TypeORM expone los decimal como string para preservar precision
 * arbitraria. Pero el frontend y la logica de negocio esperan number.
 *
 * Trade-off conocido: con valores que excedan Number.MAX_SAFE_INTEGER se
 * pierde precision. Para precios de productos de barrio (max ~99M) no es
 * un problema. Si manana manejamos decimales gigantes (ej. una sucursal
 * vende oro), volvemos a string + biblioteca decimal.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null => (value === undefined ? null : value),
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : parseFloat(value),
};
