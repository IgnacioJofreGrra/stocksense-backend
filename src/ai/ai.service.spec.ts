import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../analytics/analytics.service';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { AiCacheService } from './ai-cache.service';
import { AiService } from './ai.service';
import { GROQ_CLIENT } from './groq.provider';

/**
 * Tests de AiService.
 *
 * Mockeamos el cliente Groq con un objeto que tiene chat.completions.create
 * — la SDK real nunca se llama. Asi los tests son deterministas, rapidos
 * y no consumen tokens.
 *
 * Tambien mockeamos los services de dominio (Products/Inventory/Analytics)
 * porque acotan: probamos la logica de orquestacion + parsing + cache,
 * no la integracion con la BD (eso lo cubren los specs de cada modulo).
 */
describe('AiService', () => {
  let service: AiService;
  let groqMock: { chat: { completions: { create: jest.Mock } } };
  let productsService: jest.Mocked<ProductsService>;
  let inventoryService: jest.Mocked<InventoryService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let cache: AiCacheService;

  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const productoFake = (overrides: Partial<Product> = {}): Product => ({
    id: 'p-1',
    ean13: '7501031311309',
    nombre: 'Coca Cola',
    descripcion: null,
    categoria: null,
    precioCompra: 1500,
    precioVenta: 2000,
    unidadMedida: 'unidad',
    stockMinimo: 5,
    imagenUrl: null,
    activo: true,
    userId: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  /** Construye el modulo de testing reusable. */
  const setupModule = async (groqClient: unknown) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        AiCacheService,
        { provide: GROQ_CLIENT, useValue: groqClient },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                'groq.model': 'llama-3.3-70b-versatile',
                'groq.maxTokens': 2048,
                'groq.temperature': 0.3,
              };
              return map[key] ?? def;
            }),
          },
        },
        {
          provide: ProductsService,
          useValue: { buscarTodos: jest.fn() },
        },
        {
          provide: InventoryService,
          useValue: {
            calcularStock: jest.fn(),
            obtenerMovimientos: jest.fn(),
            obtenerAlertas: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            productosMasVendidos: jest.fn(),
            ventasPorDiaSemana: jest.fn(),
            ventasPorHora: jest.fn(),
            resumenPeriodo: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AiService);
    productsService = module.get(ProductsService);
    inventoryService = module.get(InventoryService);
    analyticsService = module.get(AnalyticsService);
    cache = module.get(AiCacheService);
  };

  beforeEach(async () => {
    groqMock = { chat: { completions: { create: jest.fn() } } };
    await setupModule(groqMock);
  });

  // ============================================================
  // PREDECIR REPOSICION
  // ============================================================
  describe('predecirReposicion', () => {
    const setupDatos = (productos: Product[]) => {
      productsService.buscarTodos.mockResolvedValue({
        data: productos,
        total: productos.length,
        page: 1,
        lastPage: 1,
      });
      inventoryService.calcularStock.mockResolvedValue({
        productId: 'p-1',
        stockActual: 10,
        ultimoMovimiento: new Date(),
      });
      inventoryService.obtenerMovimientos.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
      });
    };

    it('retorna [] si el usuario no tiene productos', async () => {
      productsService.buscarTodos.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
      });
      const result = await service.predecirReposicion(USER_ID);
      expect(result).toEqual([]);
      expect(groqMock.chat.completions.create).not.toHaveBeenCalled();
    });

    it('llama a Groq y mapea respuesta JSON valida a PrediccionRestock[]', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  productoId: 'p-1',
                  nombre: 'IGNORADO_LO_REEMPLAZA_EL_REAL',
                  stockActual: 10,
                  consumoPromedioDiario: 2,
                  diasHastaAgotamiento: 5,
                  cantidadSugeridaReponer: 30,
                  urgencia: 'alta',
                  razonamiento: 'Vende 2/dia, queda para 5 dias',
                },
              ]),
            },
          },
        ],
      });

      const result = await service.predecirReposicion(USER_ID);

      expect(result).toHaveLength(1);
      // El nombre/EAN se sobreescribe con el real (defensa contra LLM creativo).
      expect(result[0].nombre).toBe('Coca Cola');
      expect(result[0].ean13).toBe('7501031311309');
      expect(result[0].urgencia).toBe('alta');
      expect(result[0].cantidadSugeridaReponer).toBe(30);
    });

    it('filtra predicciones con productoId que no pertenece al user', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { productoId: 'p-INEXISTENTE', urgencia: 'alta' },
                {
                  productoId: 'p-1',
                  stockActual: 10,
                  consumoPromedioDiario: 2,
                  diasHastaAgotamiento: 5,
                  cantidadSugeridaReponer: 30,
                  urgencia: 'alta',
                  razonamiento: 'ok',
                },
              ]),
            },
          },
        ],
      });

      const result = await service.predecirReposicion(USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].productoId).toBe('p-1');
    });

    it('hace retry si el primer JSON viene invalido', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'No JSON, solo texto que no parsea' } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: '[]' } }],
        });

      const result = await service.predecirReposicion(USER_ID);
      expect(result).toEqual([]);
      expect(groqMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('lanza 500 si dos intentos fallan en parsear', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'jamas parseable' } }],
      });

      await expect(service.predecirReposicion(USER_ID)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('mapea 429 de Groq a 503 ServiceUnavailable', async () => {
      setupDatos([productoFake()]);
      const err = Object.assign(new Error('rate limited'), { status: 429 });
      groqMock.chat.completions.create.mockRejectedValue(err);

      await expect(service.predecirReposicion(USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('mapea 401 de Groq a 503 (api key invalida)', async () => {
      setupDatos([productoFake()]);
      const err = Object.assign(new Error('invalid key'), { status: 401 });
      groqMock.chat.completions.create.mockRejectedValue(err);

      await expect(service.predecirReposicion(USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('cache hit en segunda llamada NO llama a Groq', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '[]' } }],
      });

      await service.predecirReposicion(USER_ID);
      await service.predecirReposicion(USER_ID);

      expect(groqMock.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('cache se invalida al recibir evento stock.movimiento del user', async () => {
      setupDatos([productoFake()]);
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '[]' } }],
      });

      await service.predecirReposicion(USER_ID);
      cache.onStockMovimiento({ userId: USER_ID });
      await service.predecirReposicion(USER_ID);

      expect(groqMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // SIN GROQ CLIENT (API key vacia)
  // ============================================================
  describe('sin Groq client', () => {
    beforeEach(async () => {
      // Reset modulo con groq null (simula GROQ_API_KEY vacia).
      await setupModule(null);
      productsService.buscarTodos.mockResolvedValue({
        data: [productoFake()],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      inventoryService.calcularStock.mockResolvedValue({
        productId: 'p-1',
        stockActual: 10,
        ultimoMovimiento: null,
      });
      inventoryService.obtenerMovimientos.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
      });
    });

    it('lanza ServiceUnavailable si se intenta usar la IA', async () => {
      await expect(service.predecirReposicion(USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  // ============================================================
  // ANALIZAR TENDENCIAS
  // ============================================================
  describe('analizarTendencias', () => {
    const setupAnalytics = () => {
      analyticsService.productosMasVendidos.mockResolvedValue([]);
      analyticsService.ventasPorDiaSemana.mockResolvedValue([]);
      analyticsService.ventasPorHora.mockResolvedValue([]);
      analyticsService.resumenPeriodo.mockResolvedValue({
        totalEntradas: 0,
        totalSalidas: 0,
        productosUnicos: 0,
        movimientosTotales: 0,
        promedioDiarioVentas: 0,
      });
    };

    it('arma respuesta con defaults si la IA omite campos', async () => {
      setupAnalytics();
      groqMock.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                resumenGeneral: 'Datos insuficientes para detectar patrones.',
                // omite patronesDiarios, etc.
              }),
            },
          },
        ],
      });

      const result = await service.analizarTendencias(USER_ID);
      expect(result.patronesDiarios).toEqual([]);
      expect(result.patronesHorarios).toEqual([]);
      expect(result.resumenGeneral).toContain('insuficientes');
    });
  });

  // ============================================================
  // GENERAR ORDEN DE COMPRA
  // ============================================================
  describe('generarOrdenCompra', () => {
    it('ordena items por prioridad (urgente -> normal -> opcional)', async () => {
      productsService.buscarTodos.mockResolvedValue({
        data: [
          productoFake({ id: 'p-1', precioCompra: 100 }),
          productoFake({ id: 'p-2', precioCompra: 200 }),
        ],
        total: 2,
        page: 1,
        lastPage: 1,
      });
      inventoryService.calcularStock.mockResolvedValue({
        productId: 'p-1',
        stockActual: 10,
        ultimoMovimiento: null,
      });
      inventoryService.obtenerMovimientos.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
      });
      inventoryService.obtenerAlertas.mockResolvedValue([]);

      // Primer call de Groq (predecirReposicion interno) -> []
      // Segundo call (generarOrdenCompra) -> orden con dos items mezclados
      groqMock.chat.completions.create
        .mockResolvedValueOnce({ choices: [{ message: { content: '[]' } }] })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    {
                      productoId: 'p-2',
                      cantidadSugerida: 5,
                      prioridad: 'opcional',
                      motivo: 'reposicion preventiva',
                    },
                    {
                      productoId: 'p-1',
                      cantidadSugerida: 20,
                      prioridad: 'urgente',
                      motivo: 'stock 0',
                    },
                  ],
                  notas: 'Comprar esta semana',
                  fechaSugerida: 'esta semana',
                }),
              },
            },
          ],
        });

      const result = await service.generarOrdenCompra(USER_ID, { diasCobertura: 14 });

      expect(result.items.map((i) => i.prioridad)).toEqual(['urgente', 'opcional']);
      // Subtotal calculado por nosotros, no por la IA: cantidad * precioCompra real.
      expect(result.items[0].subtotalEstimado).toBe(20 * 100);
      expect(result.items[1].subtotalEstimado).toBe(5 * 200);
      expect(result.totalEstimado).toBe(20 * 100 + 5 * 200);
    });
  });
});
