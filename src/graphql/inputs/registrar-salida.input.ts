import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

@InputType()
export class RegistrarSalidaInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1, { message: 'La cantidad de una salida debe ser al menos 1' })
  cantidad!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  motivo?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
