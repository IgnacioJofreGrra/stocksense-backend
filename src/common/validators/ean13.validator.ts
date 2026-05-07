import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Verifica si un string es un EAN-13 valido (incluyendo digito verificador).
 *
 * Algoritmo estandar EAN-13 (1-indexed):
 *   suma = (d1 + d3 + d5 + d7 + d9 + d11) * 1
 *        + (d2 + d4 + d6 + d8 + d10 + d12) * 3
 *   check_esperado = (10 - (suma mod 10)) mod 10
 *
 * Exportado como funcion pura para que tests y otros servicios puedan reusar
 * la logica sin pasar por class-validator.
 */
export function isValidEan13(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{13}$/.test(value)) {
    return false;
  }
  let suma = 0;
  // Recorremos los primeros 12 digitos. El 13 es el verificador.
  for (let i = 0; i < 12; i++) {
    const digito = Number(value.charAt(i));
    // Posicion 1-indexed: i=0 -> pos 1 (impar) -> peso 1.
    // i=1 -> pos 2 (par) -> peso 3. Y asi.
    const peso = (i + 1) % 2 === 0 ? 3 : 1;
    suma += digito * peso;
  }
  const checkEsperado = (10 - (suma % 10)) % 10;
  const checkRecibido = Number(value.charAt(12));
  return checkEsperado === checkRecibido;
}

/**
 * Constraint class-validator que envuelve isValidEan13.
 * Lo registra el decorador @IsEan13().
 */
@ValidatorConstraint({ name: 'isEan13', async: false })
export class IsEan13Constraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidEan13(value);
  }
  defaultMessage(): string {
    return 'El codigo EAN-13 no es valido: digito verificador incorrecto';
  }
}

/**
 * @IsEan13() - decorador de class-validator para usar en DTOs.
 *
 *   class CreateProductDto {
 *     @IsEan13()
 *     ean13!: string;
 *   }
 *
 * Por que decorador y no pipe: la validacion de formato pertenece al DTO
 * (declarativa, reusable). Un pipe quedaria atado a un parametro especifico.
 */
export function IsEan13(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isEan13',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsEan13Constraint,
    });
  };
}
