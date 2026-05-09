/**
 * Helpers para parsear el output del LLM.
 *
 * Los LLM (incluso con response_format: json_object) a veces devuelven:
 *   - JSON puro (caso ideal)
 *   - JSON envuelto en ```json ... ```
 *   - JSON con texto explicativo antes/despues
 *   - JSON con comentarios estilo // o /* (no validos en spec)
 *
 * extractJson() sobrevive a los 3 primeros casos. Para los comentarios
 * no nos esforzamos — si pasa, el retry con prompt mas estricto deberia
 * resolver.
 */

/**
 * Encuentra el primer bloque JSON valido en `raw` y lo parsea.
 * Devuelve null si no encuentra nada parseable.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;

  // 1. Strip markdown fences (triple-backtick json o triple-backtick plano).
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;

  // 2. Intento parse directo.
  const trimmed = candidate.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // sigue
  }

  // 3. Buscar primer { o [ y ultimo } o ] — extraer substring entre
  //    ellos. Maneja casos "Aqui va: {...}. Espero te sirva."
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) return null;
  const lastObj = trimmed.lastIndexOf('}');
  const lastArr = trimmed.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end <= start) return null;
  const slice = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}
