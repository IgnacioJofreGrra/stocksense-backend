import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { CreateAjusteDto } from './dto/create-ajuste.dto';
import { CreateEntradaDto } from './dto/create-entrada.dto';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { StockMovement, StockMovementType } from './entities/stock-movement.entity';
import { ActorContext, InventoryService } from './inventory.service';

/**
 * Tests unitarios de InventoryService.
 *
 * Mockeamos Repository<StockMovement> y ProductsService. El QueryBuilder
 * (usado para calcular stock y filtrar movimientos) se simula con un mock
 * encadenable que retorna `this` salvo en los terminadores (getRawOne,
 * getRawMany, getManyAndCount).
 *
 * No tocamos BD: solo validamos la logica del service (signo de cantidad
 * por tipo, validacion de stock antes de salida, propagacion de userId).
 */
describe('InventoryService', () => {
  let service: InventoryService;
  let repository: jest.Mocked<Repository<StockMovement>>;
  let productsService: jest.Mocked<ProductsService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let qb: jest.Mocked<SelectQueryBuilder<StockMovement>>;

  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const PRODUCT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ACTOR: ActorContext = { userId: USER_ID, comercioNombre: 'Almacen Test' };

  const buildProduct = (overrides: Partial<Product> = {}): Product => ({
    id: PRODUCT_ID,
    ean13: '7501031311309',
    nombre: 'Coca Cola 2.5L',
    descripcion: null,
    categoria: 'Bebidas',
    precioCompra: 1500,
    precioVenta: 2000,
    unidadMedida: 'unidad',
    stockMinimo: 5,
    imagenUrl: null,
    activo: true,
    userId: USER_ID,
    createdAt: new Date('2026-05-07T00:00:00Z'),
    updatedAt: new Date('2026-05-07T00:00:00Z'),
    ...overrides,
  });

  /** Helper para fingir que calcularStockNumero retorna `valor`. */
  const stubStockEnQueryBuilder = (valor: number): void => {
    qb.getRawOne.mockResolvedValue({ stock: valor.toString() });
  };

  beforeEach(async () => {
    qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getManyAndCount: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<StockMovement>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(StockMovement),
          useValue: {
            create: jest.fn((data: Partial<StockMovement>): Partial<StockMovement> => data),
            save: jest.fn((data: Partial<StockMovement>) =>
              Promise.resolve({ id: 'mov-id', ...data } as StockMovement),
            ),
            createQueryBuilder: jest.fn(() => qb),
            // El service usa repository.manager.createQueryBuilder() para alertas.
            manager: {
              createQueryBuilder: jest.fn(() => qb),
            },
          },
        },
        {
          provide: ProductsService,
          useValue: {
            buscarPorId: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            // Default: registrarEvento resuelve OK. Tests especificos
            // pueden hacerlo fallar para verificar el patron fire-and-forget.
            registrarEvento: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            // Mock simple: no necesitamos verificar eventos en estos tests
            // (el bridge listener tiene su propia spec).
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(InventoryService);
    repository = module.get(getRepositoryToken(StockMovement));
    productsService = module.get(ProductsService);
    analyticsService = module.get(AnalyticsService);
  });

  // ===== ENTRADAS =====
  describe('registrarEntrada', () => {
    const dto: CreateEntradaDto = { productId: PRODUCT_ID, cantidad: 50 };

    it('debería registrar una entrada y actualizar stock', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(50);

      const result = await service.registrarEntrada(dto, ACTOR);

      expect(productsService.buscarPorId).toHaveBeenCalledWith(PRODUCT_ID, USER_ID);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: StockMovementType.ENTRADA,
          cantidad: 50,
          motivo: 'compra',
          productId: PRODUCT_ID,
          userId: USER_ID,
        }),
      );
      expect(result.stockActual).toBe(50);
    });

    it('debería rechazar entrada para producto inexistente', async () => {
      productsService.buscarPorId.mockRejectedValue(
        new NotFoundException('Producto no encontrado'),
      );
      await expect(service.registrarEntrada(dto, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('debería rechazar entrada para producto desactivado', async () => {
      // ProductsService.buscarPorId con default ya filtra activo:true,
      // asi que productos desactivados llegan como NotFoundException.
      productsService.buscarPorId.mockRejectedValue(
        new NotFoundException('Producto no encontrado'),
      );
      await expect(service.registrarEntrada(dto, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      // Verifica que no pasamos incluirInactivos:true en entradas.
      expect(productsService.buscarPorId).toHaveBeenCalledWith(PRODUCT_ID, USER_ID);
    });
  });

  // ===== SALIDAS =====
  describe('registrarSalida', () => {
    it('debería registrar salida cuando hay stock suficiente', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(50); // stockAntes = 50
      const dto: CreateSalidaDto = { productId: PRODUCT_ID, cantidad: 10 };

      const result = await service.registrarSalida(dto, ACTOR);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: StockMovementType.SALIDA,
          cantidad: 10,
          motivo: 'venta',
        }),
      );
      expect(result.stockActual).toBe(40);
    });

    it('debería rechazar salida cuando stock es insuficiente con mensaje claro', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(5);
      const dto: CreateSalidaDto = { productId: PRODUCT_ID, cantidad: 10 };

      await expect(service.registrarSalida(dto, ACTOR)).rejects.toThrow(
        /Stock insuficiente.*Stock actual: 5.*salida solicitada: 10/,
      );
      await expect(service.registrarSalida(dto, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('debería permitir salida que deja stock en exactamente 0', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(10);
      const dto: CreateSalidaDto = { productId: PRODUCT_ID, cantidad: 10 };

      const result = await service.registrarSalida(dto, ACTOR);

      expect(result.stockActual).toBe(0);
    });
  });

  // ===== AJUSTES =====
  describe('registrarAjuste', () => {
    const dtoBase: CreateAjusteDto = {
      productId: PRODUCT_ID,
      cantidad: 0, // sobrescrito en cada test
      motivo: 'recuento fisico',
    };

    it('debería registrar ajuste positivo (suma stock)', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(20);

      const result = await service.registrarAjuste({ ...dtoBase, cantidad: 5 }, ACTOR);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: StockMovementType.AJUSTE, cantidad: 5 }),
      );
      expect(result.stockActual).toBe(25);
    });

    it('debería registrar ajuste negativo (resta stock)', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(20);

      const result = await service.registrarAjuste(
        { ...dtoBase, cantidad: -5, motivo: 'merma' },
        ACTOR,
      );

      expect(result.stockActual).toBe(15);
    });

    it('debería rechazar ajuste que dejaría stock negativo', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(3);

      await expect(
        service.registrarAjuste({ ...dtoBase, cantidad: -10, motivo: 'merma' }, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('debería permitir ajuste sobre producto desactivado', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct({ activo: false }));
      stubStockEnQueryBuilder(0);

      await service.registrarAjuste({ ...dtoBase, cantidad: 3, motivo: 'inv inicial' }, ACTOR);

      // El service debe pedir el producto con incluirInactivos:true.
      expect(productsService.buscarPorId).toHaveBeenCalledWith(PRODUCT_ID, USER_ID, {
        incluirInactivos: true,
      });
    });
  });

  // ===== FIRE-AND-FORGET A ANALYTICS =====
  describe('emision de eventos analiticos (fire-and-forget)', () => {
    it('debería emitir evento a Mongo al registrar entrada (con datos desnormalizados)', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(50);

      await service.registrarEntrada({ productId: PRODUCT_ID, cantidad: 50 }, ACTOR);

      // Esperamos al microtask para que el .catch del fire-and-forget se procese.
      await new Promise((r) => setImmediate(r));

      expect(analyticsService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: StockMovementType.ENTRADA,
          productoId: PRODUCT_ID,
          ean13: '7501031311309',
          nombreProducto: 'Coca Cola 2.5L',
          cantidad: 50,
          userId: USER_ID,
          comercioNombre: ACTOR.comercioNombre,
        }),
      );
    });

    it('debería emitir evento a Mongo al registrar salida', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(20);

      await service.registrarSalida({ productId: PRODUCT_ID, cantidad: 5 }, ACTOR);
      await new Promise((r) => setImmediate(r));

      expect(analyticsService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: StockMovementType.SALIDA, cantidad: 5 }),
      );
    });

    it('debería NO fallar si Mongo está caído (fire-and-forget swallow)', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      stubStockEnQueryBuilder(20);
      // Simulamos que Mongo esta caido: la promise rechaza.
      analyticsService.registrarEvento.mockRejectedValue(new Error('Mongo down'));

      // El service principal NO debe propagar el error.
      const result = await service.registrarEntrada({ productId: PRODUCT_ID, cantidad: 10 }, ACTOR);
      // Esperamos al microtask para que el .catch se procese y no quede
      // un unhandled rejection en el test runner.
      await new Promise((r) => setImmediate(r));

      expect(result.stockActual).toBe(20);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  // ===== STOCK Y ALERTAS =====
  describe('calcularStock', () => {
    it('debería calcular stock combinando entradas, salidas y ajustes', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      // El SQL agregado retorna el resultado neto: 100 - 30 + 5 = 75.
      const fechaUltimo = new Date('2026-05-07T15:00:00Z');
      qb.getRawOne.mockResolvedValue({ stock: '75', ultimo: fechaUltimo });

      const result = await service.calcularStock(PRODUCT_ID, USER_ID);

      expect(result).toEqual({
        productId: PRODUCT_ID,
        stockActual: 75,
        ultimoMovimiento: fechaUltimo,
      });
    });

    it('debería retornar stock 0 para producto sin movimientos', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      qb.getRawOne.mockResolvedValue({ stock: '0', ultimo: null });

      const result = await service.calcularStock(PRODUCT_ID, USER_ID);

      expect(result.stockActual).toBe(0);
      expect(result.ultimoMovimiento).toBeNull();
    });
  });

  describe('obtenerAlertas', () => {
    it('debería retornar alertas con diferencia calculada', async () => {
      qb.getRawMany.mockResolvedValue([
        {
          id: PRODUCT_ID,
          ean13: '7501031311309',
          nombre: 'Coca Cola 2.5L',
          descripcion: null,
          categoria: 'Bebidas',
          precioCompra: '1500.00',
          precioVenta: '2000.00',
          unidadMedida: 'unidad',
          stockMinimo: '5',
          imagenUrl: null,
          activo: true,
          userId: USER_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
          stockActual: '2',
        },
      ]);

      const result = await service.obtenerAlertas(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        stockActual: 2,
        stockMinimo: 5,
        diferencia: -3, // 2 - 5
      });
      // Verifica conversion de string -> number para precios.
      expect(result[0].producto.precioCompra).toBe(1500);
      expect(result[0].producto.precioVenta).toBe(2000);
    });

    it('debería retornar lista vacia si no hay productos bajo el minimo', async () => {
      qb.getRawMany.mockResolvedValue([]);
      const result = await service.obtenerAlertas(USER_ID);
      expect(result).toEqual([]);
    });
  });

  // ===== HISTORIAL =====
  describe('obtenerMovimientos', () => {
    const movs: StockMovement[] = [
      {
        id: 'm1',
        tipo: StockMovementType.ENTRADA,
        cantidad: 50,
        motivo: 'compra',
        nota: null,
        productId: PRODUCT_ID,
        userId: USER_ID,
        createdAt: new Date(),
      },
    ];

    it('debería listar movimientos paginados ordenados por fecha desc', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      qb.getManyAndCount.mockResolvedValue([movs, 1]);

      const result = await service.obtenerMovimientos(PRODUCT_ID, { page: 1, limit: 20 }, USER_ID);

      expect(qb.orderBy).toHaveBeenCalledWith('m."createdAt"', 'DESC');
      expect(result).toEqual({ data: movs, total: 1, page: 1, lastPage: 1 });
    });

    it('debería filtrar por tipo cuando viene el parametro', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.obtenerMovimientos(PRODUCT_ID, { tipo: StockMovementType.SALIDA }, USER_ID);

      expect(qb.andWhere).toHaveBeenCalledWith('m.tipo = :tipo', {
        tipo: StockMovementType.SALIDA,
      });
    });

    it('debería filtrar por rango de fechas', async () => {
      productsService.buscarPorId.mockResolvedValue(buildProduct());
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.obtenerMovimientos(
        PRODUCT_ID,
        { desde: '2026-05-01', hasta: '2026-05-07' },
        USER_ID,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('m."createdAt" >= :desde', {
        desde: '2026-05-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('m."createdAt" <= :hasta', {
        hasta: '2026-05-07',
      });
    });

    it('debería rechazar si el producto no pertenece al usuario', async () => {
      productsService.buscarPorId.mockRejectedValue(
        new NotFoundException('Producto no encontrado'),
      );

      await expect(service.obtenerMovimientos(PRODUCT_ID, {}, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
