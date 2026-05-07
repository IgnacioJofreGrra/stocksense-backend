import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StockMovementType } from '../../inventory/entities/stock-movement.entity';

@InputType()
export class QueryMovimientosInput {
  @Field(() => Int, { defaultValue: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Field(() => Int, { defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // El enum StockMovementType ya esta registrado en stock-movement.entity.ts
  // (registerEnumType corre al importar la entidad). Aqui solo lo usamos.
  @Field(() => StockMovementType, { nullable: true })
  @IsOptional()
  @IsEnum(StockMovementType)
  tipo?: StockMovementType;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
