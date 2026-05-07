import { Field, InputType, PartialType } from '@nestjs/graphql';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductInput } from './create-product.input';

/**
 * Input para mutation actualizarProducto.
 *
 * PartialType de @nestjs/graphql (NO el de @nestjs/mapped-types) hereda
 * los Field y validadores de CreateProductInput marcandolos opcionales.
 * Es la version GraphQL del PartialType que ya usamos en UpdateProductDto.
 *
 * `activo` se agrega aparte para reactivar productos soft-deleted desde
 * GraphQL (espejado con UpdateProductDto del REST).
 */
@InputType()
export class UpdateProductInput extends PartialType(CreateProductInput) {
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
