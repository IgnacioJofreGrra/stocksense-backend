import { Field, Float, InputType, Int } from '@nestjs/graphql';
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
 * Input para mutation crearProducto.
 *
 * Reusa los decoradores de class-validator del DTO REST. El ValidationPipe
 * global de NestJS valida los argumentos de GraphQL igual que los bodies HTTP.
 */
@InputType()
export class CreateProductInput {
  @Field()
  @IsEan13()
  ean13!: string;

  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombre!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsPositive()
  precioCompra?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsPositive()
  precioVenta?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadMedida?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imagenUrl?: string;
}
