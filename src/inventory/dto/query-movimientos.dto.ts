import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StockMovementType } from '../entities/stock-movement.entity';

/**
 * Query string para historial de movimientos paginado.
 *
 * IsDateString acepta ISO 8601 ("2026-05-07" o "2026-05-07T10:00:00Z").
 * El service convierte a Date para usar en BD. No usamos @Type(() => Date)
 * porque IsDateString valida el formato; @Type prematura podria aceptar
 * strings invalidos como "abc" y crear Invalid Date.
 */
export class QueryMovimientosDto {
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
  @IsEnum(StockMovementType)
  tipo?: StockMovementType;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
