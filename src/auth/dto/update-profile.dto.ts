import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO de actualizacion de perfil.
 *
 * Solo permite cambiar `nombre` y `comercioNombre`. Email y rol se quedan
 * fijos: el email es el identificador (cambiarlo es flujo aparte con
 * verificacion); el rol no se auto-promueve nunca desde un endpoint publico.
 *
 * Ambos campos opcionales: el cliente puede mandar uno solo. Si manda body
 * vacio, el service devuelve el usuario sin cambios.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre del comercio debe tener al menos 2 caracteres' })
  @MaxLength(150)
  comercioNombre?: string;
}
