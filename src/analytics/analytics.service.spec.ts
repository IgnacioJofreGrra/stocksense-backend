import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { AnalyticsService, RegistrarEventoInput } from './analytics.service';
import { AnalyticsEvent } from './schemas/analytics-event.schema';

/**
 * Tests unitarios de AnalyticsService.
 *
 * Mockeamos Model<AnalyticsEvent>. Los pipelines de agregacion no se
 * ejecutan contra Mongo real: verificamos que el service arme bien el
 * pipeline (filtros, group, sort) y que mapee correctamente la respuesta
 * cruda al formato publico.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let model: jest.Mocked<Model<AnalyticsEvent>>;

  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const PRODUCT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getModelToken(AnalyticsEvent.name),
          useValue: {
            create: jest.fn(),
            aggregate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    model = module.get(getModelToken(AnalyticsEvent.name));
  });

  // ===== REGISTRO DE EVENTO =====
  describe('registrarEvento', () => {
    it('debería crear un evento con metadata temporal correcta', async () => {
      // 2026-05-07 es jueves (4 en getDay), hora 14, mes 5, anio 2026.
      const timestamp = new Date('2026-05-07T14:30:00.000Z');
      // Construimos contra horario LOCAL del runner (getDay/getHours usan local time).
      const expectedDiaSemana = timestamp.getDay();
      const expectedHora = timestamp.getHours();
      const expectedMes = timestamp.getMonth() + 1;
      const expectedAnio = timestamp.getFullYear();

      const input: RegistrarEventoInput = {
        tipo: 'salida',
        productoId: PRODUCT_ID,
        ean13: '7501031311309',
        nombreProducto: 'Coca Cola 2.5L',
        cantidad: 3,
        userId: USER_ID,
        comercioNombre: 'Almacen Pedro',
        timestamp,
      };

      await service.registrarEvento(input);

      expect(model.create).toHaveBeenCalledTimes(1);
      const callArg = model.create.mock.calls[0][0] as { metadata: Record<string, number> };
      expect(callArg.metadata).toEqual({
        diaSemana: expectedDiaSemana,
        hora: expectedHora,
        mes: expectedMes,
        anio: expectedAnio,
      });
    });

    it('debería almacenar datos desnormalizados (nombreProducto, comercioNombre)', async () => {
      await service.registrarEvento({
        tipo: 'entrada',
        productoId: PRODUCT_ID,
        ean13: '5901234123457',
        nombreProducto: 'Galletas Oreo',
        cantidad: 50,
        userId: USER_ID,
        comercioNombre: 'Almacen Pedro',
        timestamp: new Date(),
      });

      const callArg = model.create.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.nombreProducto).toBe('Galletas Oreo');
      expect(callArg.comercioNombre).toBe('Almacen Pedro');
      expect(callArg.ean13).toBe('5901234123457');
    });
  });

  // ===== AGREGACIONES =====
  describe('productosMasVendidos', () => {
    it('debería retornar productos ordenados por cantidad y mapear _id a productoId', async () => {
      model.aggregate.mockResolvedValue([
        {
          _id: PRODUCT_ID,
          ean13: '7501031311309',
          nombreProducto: 'Coca Cola 2.5L',
          totalVendido: 50,
          cantidadMovimientos: 10,
        },
      ]);

      const result = await service.productosMasVendidos(USER_ID, { limite: 5 });

      // El primer stage del pipeline es el $match: validamos su forma.
      const pipeline = model.aggregate.mock.calls[0][0] as unknown as Array<
        Record<string, unknown>
      >;
      expect(pipeline[0]).toEqual({ $match: { userId: USER_ID, tipo: 'salida' } });
      // El $limit debe usar el valor que pasamos.
      expect(pipeline[3]).toEqual({ $limit: 5 });
      expect(result).toEqual([
        {
          productoId: PRODUCT_ID,
          ean13: '7501031311309',
          nombreProducto: 'Coca Cola 2.5L',
          totalVendido: 50,
          cantidadMovimientos: 10,
        },
      ]);
    });

    it('debería filtrar por rango de fechas cuando se especifica', async () => {
      model.aggregate.mockResolvedValue([]);
      const desde = new Date('2026-05-01');
      const hasta = new Date('2026-05-07');

      await service.productosMasVendidos(USER_ID, { desde, hasta });

      const pipeline = model.aggregate.mock.calls[0][0] as unknown as Array<
        Record<string, unknown>
      >;
      const matchStage = pipeline[0].$match as Record<string, unknown>;
      expect(matchStage.timestamp).toEqual({ $gte: desde, $lte: hasta });
    });
  });

  describe('ventasPorDiaSemana', () => {
    it('debería mapear diaSemana 0..6 a nombres en español', async () => {
      model.aggregate.mockResolvedValue([
        { _id: 1, totalVentas: 30 }, // Lunes
        { _id: 5, totalVentas: 50 }, // Viernes
      ]);

      const result = await service.ventasPorDiaSemana(USER_ID);

      expect(result).toEqual([
        { diaSemana: 1, nombreDia: 'Lunes', totalVentas: 30 },
        { diaSemana: 5, nombreDia: 'Viernes', totalVentas: 50 },
      ]);
    });
  });

  describe('ventasPorHora', () => {
    it('debería retornar ventas agrupadas por hora', async () => {
      model.aggregate.mockResolvedValue([
        { _id: 9, totalVentas: 5 },
        { _id: 18, totalVentas: 12 },
      ]);

      const result = await service.ventasPorHora(USER_ID);

      expect(result).toEqual([
        { hora: 9, totalVentas: 5 },
        { hora: 18, totalVentas: 12 },
      ]);
    });
  });

  describe('tendenciaProducto', () => {
    it('debería formatear periodo como YYYY-MM (mes con 0-padding)', async () => {
      model.aggregate.mockResolvedValue([
        { _id: { anio: 2026, mes: 3 }, totalMovimientos: 10, cantidadTotal: 50 },
        { _id: { anio: 2026, mes: 11 }, totalMovimientos: 8, cantidadTotal: 40 },
      ]);

      const result = await service.tendenciaProducto(PRODUCT_ID, USER_ID);

      expect(result).toEqual([
        { periodo: '2026-03', totalMovimientos: 10, cantidadTotal: 50 },
        { periodo: '2026-11', totalMovimientos: 8, cantidadTotal: 40 },
      ]);
      // El $match incluye productoId.
      const pipeline = model.aggregate.mock.calls[0][0] as unknown as Array<
        Record<string, unknown>
      >;
      const matchStage = pipeline[0].$match as Record<string, unknown>;
      expect(matchStage.productoId).toBe(PRODUCT_ID);
      expect(matchStage.userId).toBe(USER_ID);
    });
  });

  describe('resumenPeriodo', () => {
    it('debería calcular totales y promedio diario', async () => {
      model.aggregate.mockResolvedValue([
        {
          totalEntradas: 100,
          totalSalidas: 30,
          productosUnicos: ['p1', 'p2', 'p3'],
          movimientosTotales: 15,
          primerEvento: new Date('2026-05-01T00:00:00Z'),
          ultimoEvento: new Date('2026-05-04T00:00:00Z'),
        },
      ]);

      const result = await service.resumenPeriodo(USER_ID);

      expect(result.totalEntradas).toBe(100);
      expect(result.totalSalidas).toBe(30);
      expect(result.productosUnicos).toBe(3);
      expect(result.movimientosTotales).toBe(15);
      // 30 salidas / 3 dias = 10 promedio diario
      expect(result.promedioDiarioVentas).toBe(10);
    });

    it('debería retornar zeros cuando no hay eventos', async () => {
      model.aggregate.mockResolvedValue([]);

      const result = await service.resumenPeriodo(USER_ID);

      expect(result).toEqual({
        totalEntradas: 0,
        totalSalidas: 0,
        productosUnicos: 0,
        movimientosTotales: 0,
        promedioDiarioVentas: 0,
      });
    });
  });
});
