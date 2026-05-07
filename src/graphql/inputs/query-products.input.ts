import { Field, InputType, Int, registerEnumType } from '@nestjs/graphql';
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
import { ProductOrderBy, SortOrder } from '../../products/dto/query-product.dto';

// Registramos los enums TS en el sistema de tipos GraphQL. Ejecuta una vez
// al cargar el modulo (registry global de @nestjs/graphql).
registerEnumType(ProductOrderBy, { name: 'ProductOrderBy' });
registerEnumType(SortOrder, { name: 'SortOrder' });

/**
 * Input para query productos. Reusa los enums ProductOrderBy/SortOrder
 * que ya tenemos en el DTO REST (registrados en el schema via registerEnumType
 * en el resolver para no duplicar).
 */
@InputType()
export class QueryProductsInput {
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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @Field(() => ProductOrderBy, { nullable: true })
  @IsOptional()
  @IsEnum(ProductOrderBy)
  orderBy?: ProductOrderBy;

  @Field(() => SortOrder, { nullable: true })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder;
}
