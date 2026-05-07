import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Input compartido para queries de analitica.
 * Los Date llegan como ISO strings; el resolver los convierte a Date.
 */
@InputType()
export class DateRangeInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
