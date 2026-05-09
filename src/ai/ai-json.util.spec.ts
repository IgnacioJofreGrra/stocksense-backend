import { extractJson } from './ai-json.util';

describe('extractJson', () => {
  it('parsea un objeto JSON puro', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parsea un array JSON puro', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('strip de markdown fences ```json ... ```', () => {
    const raw = '```json\n{"x":42}\n```';
    expect(extractJson(raw)).toEqual({ x: 42 });
  });

  it('strip de fences ``` ... ``` (sin lenguaje)', () => {
    const raw = '```\n{"y":7}\n```';
    expect(extractJson(raw)).toEqual({ y: 7 });
  });

  it('extrae JSON entre texto explicativo del LLM', () => {
    const raw = 'Aqui tenes el resultado:\n{"valor": 99}\nEspero te sirva.';
    expect(extractJson(raw)).toEqual({ valor: 99 });
  });

  it('extrae array embebido en texto', () => {
    const raw = 'Resultado: [{"id":1},{"id":2}] - listo.';
    expect(extractJson(raw)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('retorna null si no encuentra JSON parseable', () => {
    expect(extractJson('solo texto sin nada parseable')).toBeNull();
  });

  it('retorna null para input vacio', () => {
    expect(extractJson('')).toBeNull();
  });
});
