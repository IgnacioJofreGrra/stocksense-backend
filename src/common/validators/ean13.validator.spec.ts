import { validate } from 'class-validator';
import { IsEan13, isValidEan13 } from './ean13.validator';

/**
 * Tests del validador EAN-13.
 *
 * Probamos primero la funcion pura `isValidEan13` (mas rapido, sin metadata
 * de class-validator); luego un caso integrado del decorador para confirmar
 * que el wiring con class-validator funciona.
 */
describe('isValidEan13 (funcion pura)', () => {
  it('acepta un EAN-13 valido (Coca Cola Mexico: 7501031311309)', () => {
    expect(isValidEan13('7501031311309')).toBe(true);
  });

  it('acepta otros EAN-13 conocidos validos', () => {
    // Generados manualmente con el algoritmo estandar.
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('0000000000000')).toBe(true); // edge case: todos ceros, check 0
  });

  it('rechaza un EAN-13 con digito verificador incorrecto', () => {
    // Cambiamos el ultimo digito (debe ser 9, ponemos 0).
    expect(isValidEan13('7501031311300')).toBe(false);
  });

  it('rechaza un string con longitud distinta a 13', () => {
    expect(isValidEan13('123456789012')).toBe(false); // 12 digitos
    expect(isValidEan13('12345678901234')).toBe(false); // 14 digitos
    expect(isValidEan13('')).toBe(false);
  });

  it('rechaza un string con caracteres no numericos', () => {
    expect(isValidEan13('750103131130A')).toBe(false);
    expect(isValidEan13('7501-3131-1309')).toBe(false);
    expect(isValidEan13('7501 31311309')).toBe(false);
  });

  it('rechaza valores que no son string', () => {
    expect(isValidEan13(undefined)).toBe(false);
    expect(isValidEan13(null)).toBe(false);
    expect(isValidEan13(7501031311309)).toBe(false); // number, no string
    expect(isValidEan13({ ean13: '7501031311309' })).toBe(false);
  });
});

describe('@IsEan13() (decorator de class-validator)', () => {
  class TestDto {
    @IsEan13()
    ean13!: string;
  }

  it('valida correctamente un EAN-13 valido', async () => {
    const dto = new TestDto();
    dto.ean13 = '7501031311309';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('reporta error con mensaje claro cuando el digito verificador es incorrecto', async () => {
    const dto = new TestDto();
    dto.ean13 = '7501031311300';
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isEan13).toBe(
      'El codigo EAN-13 no es valido: digito verificador incorrecto',
    );
  });
});
