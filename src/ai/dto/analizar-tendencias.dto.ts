import { IsDateString, IsOptional } from 'class-validator';

export class AnalizarTendenciasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
