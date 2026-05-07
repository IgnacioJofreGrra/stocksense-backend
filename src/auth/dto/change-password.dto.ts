import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO de cambio de contrasena.
 *
 * Mismas reglas que en RegisterDto para newPassword: minimo 8, maximo 100.
 * currentPassword tambien se valida con MinLength(8) por consistencia, pero
 * el chequeo real es el bcrypt.compare contra el hash en BD (lo hace el
 * service): si la contrasena guardada quedara con menos de 8 chars por
 * alguna razon historica, igual debe poder cambiarse.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contrasena actual debe tener al menos 8 caracteres' })
  @MaxLength(100)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contrasena debe tener al menos 8 caracteres' })
  @MaxLength(100)
  newPassword!: string;
}
