import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { AnalyticsService } from '../analytics/analytics.service';
import { StockMovementType } from '../inventory/entities/stock-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { AiCacheService } from './ai-cache.service';
import { extractJson } from './ai-json.util';
import { GROQ_CLIENT, type GroqClient } from './groq.provider';
import type { AnalisisTendencias, ItemOrden, OrdenCompra, PrediccionRestock } from './ai.types';

const PRODUCTOS_LIMITE_PROMPT = 30;
const DIAS_HISTORIAL = 30;

/**
 * Errores HTTP de Groq que mapeamos a excepciones de NestJS.
 */
interface GroqError {
  status?: number;
  message?: string;
}

/**
 * AiService — orquestador de IA.
 *
 * Estructura general de cada metodo:
 * 1. Consultar cache. Si hit, devolver.
 * 2. Recopilar datos consumiendo Products/Inventory/Analytics services.
 * 3. Formatear prompt en español.
 * 4. Llamar Groq con response_format: json_object.
 * 5. Parsear (extractJson sobrevive a markdown fences/texto extra).
 * 6. Si parse falla, retry 1 vez con prompt mas estricto.
 * 7. Validar la respuesta (forma + IDs reales).
 * 8. Guardar en cache.
 * 9. Devolver tipado.
 *
 * NO confiamos en el output del LLM — siempre validamos antes de devolver.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(GROQ_CLIENT) private readonly groq: GroqClient,
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
    private readonly analyticsService: AnalyticsService,
    private readonly cache: AiCacheService,
  ) {}

  // ============================================================
  // 1. PREDECIR REPOSICION
  // ============================================================
  async predecirReposicion(userId: string): Promise<PrediccionRestock[]> {
    const cacheKey = this.cache.buildKey(userId, 'predict-restock', {});
    const hit = this.cache.get<PrediccionRestock[]>(cacheKey);
    if (hit) {
      this.logger.debug(`predict-restock cache hit user=${userId}`);
      return hit;
    }

    // Listamos productos activos del user (paginado a 100; un comercio
    // de barrio dificil pase de eso). Si pasa, paginamos.
    const { data: productos } = await this.productsService.buscarTodos(
      { page: 1, limit: 100 },
      userId,
    );

    if (productos.length === 0) return [];

    // Stock actual + ultimos N dias de movimientos por producto. Hacemos
    // las llamadas en paralelo (no son interdependientes).
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_HISTORIAL);
    const detalles = await Promise.all(
      productos.slice(0, PRODUCTOS_LIMITE_PROMPT).map(async (p) => {
        const [stock, movs] = await Promise.all([
          this.inventoryService.calcularStock(p.id, userId),
          this.inventoryService.obtenerMovimientos(
            p.id,
            { page: 1, limit: 100, desde: desde.toISOString() },
            userId,
          ),
        ]);
        return {
          id: p.id,
          ean13: p.ean13,
          nombre: p.nombre,
          stockActual: stock.stockActual,
          stockMinimo: p.stockMinimo,
          movimientosUltimos30d: movs.data.length,
          ventasUltimos30d: movs.data
            .filter((m) => m.tipo === StockMovementType.SALIDA)
            .reduce((acc, m) => acc + m.cantidad, 0),
        };
      }),
    );

    const prompt = this.buildPromptRestock(detalles);
    const raw = await this.callGroqWithRetry(prompt, 'object');
    // Groq con response_format: json_object SIEMPRE devuelve objeto top-level.
    // Aceptamos array directo (cae a este metodo en tests con mock) o
    // objeto con propiedad `predicciones`. Si nada matchea, error.
    const parsedRaw = extractJson<unknown>(raw);
    const lista = Array.isArray(parsedRaw)
      ? parsedRaw
      : Array.isArray((parsedRaw as { predicciones?: unknown })?.predicciones)
        ? ((parsedRaw as { predicciones: unknown[] }).predicciones as PrediccionRestock[])
        : null;
    if (!lista) {
      throw new InternalServerErrorException('La IA devolvio un formato inesperado');
    }

    // Validamos: el LLM puede inventar productoIds. Los filtramos contra
    // los productos reales del usuario.
    const idsValidos = new Set(productos.map((p) => p.id));
    const validados = (lista as PrediccionRestock[])
      .filter((p) => p && typeof p === 'object' && idsValidos.has(p.productoId))
      .map((p) => this.normalizarPrediccion(p, productos));

    this.cache.set(cacheKey, validados);
    return validados;
  }

  // ============================================================
  // 2. ANALIZAR TENDENCIAS
  // ============================================================
  async analizarTendencias(
    userId: string,
    opciones: { desde?: Date; hasta?: Date } = {},
  ): Promise<AnalisisTendencias> {
    const cacheKey = this.cache.buildKey(userId, 'analyze-trends', {
      desde: opciones.desde?.toISOString() ?? null,
      hasta: opciones.hasta?.toISOString() ?? null,
    });
    const hit = this.cache.get<AnalisisTendencias>(cacheKey);
    if (hit) return hit;

    const [topProductos, ventasDia, ventasHora, resumen] = await Promise.all([
      this.analyticsService.productosMasVendidos(userId, { ...opciones, limite: 10 }),
      this.analyticsService.ventasPorDiaSemana(userId, opciones),
      this.analyticsService.ventasPorHora(userId, opciones),
      this.analyticsService.resumenPeriodo(userId, opciones),
    ]);

    const prompt = this.buildPromptTendencias({
      topProductos,
      ventasDia,
      ventasHora,
      resumen,
    });
    const raw = await this.callGroqWithRetry(prompt, 'object');
    const parsed = extractJson<AnalisisTendencias>(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new InternalServerErrorException('La IA devolvio un formato inesperado');
    }

    const resultado: AnalisisTendencias = {
      patronesDiarios: Array.isArray(parsed.patronesDiarios) ? parsed.patronesDiarios : [],
      patronesHorarios: Array.isArray(parsed.patronesHorarios) ? parsed.patronesHorarios : [],
      productosDestacados: Array.isArray(parsed.productosDestacados)
        ? parsed.productosDestacados
        : [],
      recomendaciones: Array.isArray(parsed.recomendaciones) ? parsed.recomendaciones : [],
      resumenGeneral: typeof parsed.resumenGeneral === 'string' ? parsed.resumenGeneral : '',
    };
    this.cache.set(cacheKey, resultado);
    return resultado;
  }

  // ============================================================
  // 3. GENERAR ORDEN DE COMPRA
  // ============================================================
  async generarOrdenCompra(
    userId: string,
    opciones: { diasCobertura?: number } = {},
  ): Promise<OrdenCompra> {
    const diasCobertura = opciones.diasCobertura ?? 14;
    const cacheKey = this.cache.buildKey(userId, 'generate-order', { diasCobertura });
    const hit = this.cache.get<OrdenCompra>(cacheKey);
    if (hit) return hit;

    // Reusamos predecirReposicion para no duplicar logica de prediccion.
    // Si esta cacheada, ahorra otra call a Groq.
    const [predicciones, alertas, productosTodos] = await Promise.all([
      this.predecirReposicion(userId),
      this.inventoryService.obtenerAlertas(userId),
      this.productsService.buscarTodos({ page: 1, limit: 100 }, userId).then((r) => r.data),
    ]);

    const productosMap = new Map(productosTodos.map((p) => [p.id, p]));

    const prompt = this.buildPromptOrdenCompra(
      predicciones,
      alertas.map((a) => ({
        id: a.producto.id,
        nombre: a.producto.nombre,
        ean13: a.producto.ean13,
        stockActual: a.stockActual,
        stockMinimo: a.stockMinimo,
        precioCompra: a.producto.precioCompra,
      })),
      diasCobertura,
    );
    const raw = await this.callGroqWithRetry(prompt, 'object');
    const parsed = extractJson<OrdenCompra>(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new InternalServerErrorException('La IA devolvio un formato inesperado');
    }

    const items: ItemOrden[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it) => it && typeof it === 'object' && productosMap.has(it.productoId))
      .map((it) => this.normalizarItemOrden(it, productosMap.get(it.productoId)!));

    // Recalculamos total a partir de subtotales validados (no confiamos
    // en el numero que invento el LLM).
    const totalEstimado = items.some((i) => i.subtotalEstimado != null)
      ? items.reduce((acc, i) => acc + (i.subtotalEstimado ?? 0), 0)
      : null;

    const resultado: OrdenCompra = {
      items: items.sort((a, b) => prioridadOrden(a.prioridad) - prioridadOrden(b.prioridad)),
      totalEstimado,
      notas: typeof parsed.notas === 'string' ? parsed.notas : '',
      fechaSugerida: typeof parsed.fechaSugerida === 'string' ? parsed.fechaSugerida : '',
    };
    this.cache.set(cacheKey, resultado);
    return resultado;
  }

  // ============================================================
  // PROMPTS — agrupados juntos para revisar tono y consistencia.
  // ============================================================

  private buildPromptRestock(
    detalles: Array<{
      id: string;
      ean13: string;
      nombre: string;
      stockActual: number;
      stockMinimo: number;
      movimientosUltimos30d: number;
      ventasUltimos30d: number;
    }>,
  ): ChatCompletionMessageParam[] {
    return [
      {
        role: 'system',
        content:
          'Sos un asistente de inventario para un comercio de barrio. ' +
          'Tu tarea es predecir cuando cada producto se va a agotar y cuanto reponer. ' +
          'Respondes SIEMPRE con JSON valido, sin markdown ni texto adicional. ' +
          'Hablas en español rioplatense simple, sin tecnicismos.',
      },
      {
        role: 'user',
        content: `Datos del inventario (ultimos ${DIAS_HISTORIAL} dias):
${JSON.stringify(detalles, null, 2)}

Para cada producto con riesgo de agotarse en los proximos 14 dias, devolve un JSON con esta forma EXACTA (objeto con propiedad "predicciones" que contiene un array):
{
  "predicciones": [
    {
      "productoId": "uuid del producto, copiado tal cual de los datos",
      "stockActual": number,
      "consumoPromedioDiario": number,
      "diasHastaAgotamiento": number,
      "cantidadSugeridaReponer": number,
      "urgencia": "alta" | "media" | "baja",
      "razonamiento": "string breve"
    }
  ]
}

Reglas:
- Si ningun producto tiene riesgo, devolver { "predicciones": [] }.
- Solo incluir productos con riesgo en proximos 14 dias.
- Cantidad sugerida = cubrir al menos 2 semanas de consumo.
- Si el historial es escaso (< 7 dias de datos), indicarlo en razonamiento.
- Responder SOLO con el JSON, sin texto previo ni posterior.`,
      },
    ];
  }

  private buildPromptTendencias(data: {
    topProductos: unknown[];
    ventasDia: unknown[];
    ventasHora: unknown[];
    resumen: unknown;
  }): ChatCompletionMessageParam[] {
    return [
      {
        role: 'system',
        content:
          'Sos un analista de negocio para un comercio de barrio. ' +
          'Hablas en español simple. Detectas patrones utiles y das recomendaciones accionables. ' +
          'Respondes SIEMPRE con JSON valido, sin markdown ni texto adicional.',
      },
      {
        role: 'user',
        content: `Datos:
${JSON.stringify(data, null, 2)}

Devolve un JSON con esta forma:
{
  "patronesDiarios": [{ "dia": "string", "insight": "string", "relevancia": "alta"|"media"|"baja" }],
  "patronesHorarios": [{ "franja": "string", "insight": "string" }],
  "productosDestacados": [{ "nombre": "string", "patron": "string" }],
  "recomendaciones": ["string"],
  "resumenGeneral": "string"
}

Reglas:
- 3 a 5 recomendaciones, concretas y accionables.
- Si los datos son insuficientes para concluir, decirlo en resumenGeneral.
- Responder SOLO con el JSON, sin texto adicional.`,
      },
    ];
  }

  private buildPromptOrdenCompra(
    predicciones: PrediccionRestock[],
    alertas: Array<{
      id: string;
      nombre: string;
      ean13: string;
      stockActual: number;
      stockMinimo: number;
      precioCompra: number | null;
    }>,
    diasCobertura: number,
  ): ChatCompletionMessageParam[] {
    return [
      {
        role: 'system',
        content:
          'Sos un asistente de compras para un comercio de barrio. ' +
          'Generas ordenes de compra basadas en consumo y stock. ' +
          'Respondes SIEMPRE con JSON valido, sin markdown ni texto adicional.',
      },
      {
        role: 'user',
        content: `Predicciones de reposicion:
${JSON.stringify(predicciones, null, 2)}

Productos bajo stock minimo (alertas):
${JSON.stringify(alertas, null, 2)}

Dias de cobertura solicitados: ${diasCobertura}

Devolve un JSON con esta forma:
{
  "items": [
    {
      "productoId": "uuid",
      "nombre": "string",
      "ean13": "string",
      "cantidadSugerida": number,
      "precioUnitarioEstimado": number | null,
      "subtotalEstimado": number | null,
      "prioridad": "urgente" | "normal" | "opcional",
      "motivo": "string"
    }
  ],
  "totalEstimado": number | null,
  "notas": "string",
  "fechaSugerida": "string"
}

Reglas:
- Si no hay precioCompra para un producto, poner null en estimados.
- Ordenar items por prioridad (urgente -> normal -> opcional).
- fechaSugerida realista: "hoy" solo si urgente, sino "esta semana" o similar.
- Responder SOLO con el JSON.`,
      },
    ];
  }

  // ============================================================
  // INFRA: llamada a Groq con retry + manejo de errores
  // ============================================================

  /**
   * Llama a Groq y devuelve el contenido raw del primer choice.
   * Si el JSON parsea mal, retry 1 vez con un mensaje extra mas estricto.
   * shape: 'array' o 'object' — solo afecta el mensaje del retry.
   */
  private async callGroqWithRetry(
    messages: ChatCompletionMessageParam[],
    shape: 'array' | 'object',
  ): Promise<string> {
    if (!this.groq) {
      throw new ServiceUnavailableException(
        'Servicio de IA no disponible. Configurar GROQ_API_KEY.',
      );
    }

    const model = this.configService.get<string>('groq.model', 'llama-3.3-70b-versatile');
    const maxTokens = this.configService.get<number>('groq.maxTokens', 2048);
    const temperature = this.configService.get<number>('groq.temperature', 0.3);

    const intentar = async (msgs: ChatCompletionMessageParam[]): Promise<string> => {
      try {
        const completion = await this.groq!.chat.completions.create({
          model,
          messages: msgs,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        });
        return completion.choices[0]?.message?.content ?? '';
      } catch (err) {
        this.handleGroqError(err);
      }
    };

    const primerRaw = await intentar(messages);
    if (extractJson(primerRaw) !== null) return primerRaw;

    // Retry con mensaje correctivo: el LLM a veces se desboca con texto.
    this.logger.warn('Primer parse fallo. Reintentando con prompt mas estricto.');
    const correccion: ChatCompletionMessageParam = {
      role: 'user',
      content:
        `La respuesta anterior no era JSON valido. Devolveme SOLO un ${shape} JSON ` +
        'sin markdown, sin texto explicativo, sin comentarios. Empezar con ' +
        (shape === 'array' ? '[' : '{') +
        '.',
    };
    const segundoRaw = await intentar([
      ...messages,
      { role: 'assistant', content: primerRaw },
      correccion,
    ]);
    if (extractJson(segundoRaw) === null) {
      throw new InternalServerErrorException(
        'La IA no devolvio un JSON valido (despues de reintentar)',
      );
    }
    return segundoRaw;
  }

  /**
   * Mapea errores HTTP de Groq a excepciones de NestJS.
   * Nunca retorna — siempre throw.
   */
  private handleGroqError(err: unknown): never {
    const status = (err as GroqError).status;
    const message = (err as GroqError).message ?? 'error desconocido';
    if (status === 429) {
      // Rate limit del lado de Groq (no de nuestro Throttler).
      throw new ServiceUnavailableException(
        'Servicio de IA temporalmente saturado. Intentar en unos minutos.',
      );
    }
    if (status === 401) {
      this.logger.error(`API key de Groq invalida: ${message}`);
      throw new ServiceUnavailableException('Servicio de IA no configurado correctamente.');
    }
    if (status === 408 || status === 504) {
      throw new ServiceUnavailableException('Servicio de IA con timeout. Reintentar.');
    }
    this.logger.error(`Groq error ${status ?? '?'}: ${message}`);
    throw new ServiceUnavailableException('Servicio de IA temporalmente no disponible.');
  }

  // ============================================================
  // VALIDADORES Y NORMALIZADORES — defensa contra LLM creativo.
  // ============================================================

  private normalizarPrediccion(
    raw: PrediccionRestock,
    productos: Array<{ id: string; ean13: string; nombre: string; stockMinimo: number }>,
  ): PrediccionRestock {
    const real = productos.find((p) => p.id === raw.productoId)!;
    return {
      productoId: real.id,
      nombre: real.nombre,
      ean13: real.ean13,
      stockActual: typeof raw.stockActual === 'number' ? raw.stockActual : 0,
      consumoPromedioDiario:
        typeof raw.consumoPromedioDiario === 'number' ? raw.consumoPromedioDiario : 0,
      diasHastaAgotamiento:
        typeof raw.diasHastaAgotamiento === 'number'
          ? Math.max(0, Math.floor(raw.diasHastaAgotamiento))
          : 0,
      cantidadSugeridaReponer:
        typeof raw.cantidadSugeridaReponer === 'number'
          ? Math.max(0, Math.floor(raw.cantidadSugeridaReponer))
          : 0,
      urgencia: ['alta', 'media', 'baja'].includes(raw.urgencia) ? raw.urgencia : 'media',
      razonamiento: typeof raw.razonamiento === 'string' ? raw.razonamiento : '',
    };
  }

  private normalizarItemOrden(
    raw: ItemOrden,
    real: { id: string; ean13: string; nombre: string; precioCompra: number | null },
  ): ItemOrden {
    const cantidadSugerida =
      typeof raw.cantidadSugerida === 'number' ? Math.max(1, Math.floor(raw.cantidadSugerida)) : 1;
    const precioUnit = real.precioCompra ?? null;
    const subtotal = precioUnit !== null ? precioUnit * cantidadSugerida : null;
    return {
      productoId: real.id,
      nombre: real.nombre,
      ean13: real.ean13,
      cantidadSugerida,
      precioUnitarioEstimado: precioUnit,
      subtotalEstimado: subtotal,
      prioridad: ['urgente', 'normal', 'opcional'].includes(raw.prioridad)
        ? raw.prioridad
        : 'normal',
      motivo: typeof raw.motivo === 'string' ? raw.motivo : '',
    };
  }
}

function prioridadOrden(p: string): number {
  if (p === 'urgente') return 0;
  if (p === 'normal') return 1;
  return 2;
}
