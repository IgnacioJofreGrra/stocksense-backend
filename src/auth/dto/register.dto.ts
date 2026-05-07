import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO de registro.
 *
 * - @IsEmail valida formato de email a nivel sintactico (no verifica que
 *   exista el dominio, solo el formato).
 * - @MinLength(8) en password: minimo razonable. No exigimos mayuscula/numero/
 *   simbolo aqui porque la complejidad arbitraria empeora UX sin mejorar
 *   seguridad real (ver guia OWASP). Lo importante es la longitud.
 * - @MaxLength en strings: defensa contra inputs gigantes que llenen
 *   memoria/disco. 100/150 caracteres son holgados para datos reales.
 * - El rol no se acepta del cliente: por defecto crea 'empleado'. Asi nadie
 *   se auto-promueve a 'dueno' via el endpoint publico.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'El email no tiene formato valido' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  comercioNombre!: string;
}
