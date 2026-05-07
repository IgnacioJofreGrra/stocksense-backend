import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query string compartida por los endpoints de analitica.
 *
 * Todos los rangos son inclusivos. Si no se pasa `desde`, no hay limite
 * inferior; idem `hasta`. El service se encarga de armar el $match con
 * solo los rangos que vinieron.
 */
export class QueryAnalyticsDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number = 10;
}
