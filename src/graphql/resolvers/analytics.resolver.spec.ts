import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../analytics/analytics.service';
import { User, UserRole } from '../../users/entities/user.entity';
import { AnalyticsResolver } from './analytics.resolver';

describe('AnalyticsResolver', () => {
  let resolver: AnalyticsResolver;
  let analyticsService: jest.Mocked<AnalyticsService>;

  const USER: User = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'test@x.com',
    password: '',
    nombre: 'Test',
    rol: UserRole.DUENO,
    comercioNombre: 'Almacen Test',
    activo: true,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsResolver,
        {
          provide: AnalyticsService,
          useValue: {
            productosMasVendidos: jest.fn(),
            ventasPorDiaSemana: jest.fn(),
            ventasPorHora: jest.fn(),
            tendenciaProducto: jest.fn(),
            resumenPeriodo: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get(AnalyticsResolver);
    analyticsService = module.get(AnalyticsService);
  });

  it('productosMasVendidos: convierte strings ISO a Date antes de llamar al service', async () => {
    analyticsService.productosMasVendidos.mockResolvedValue([]);

    await resolver.productosMasVendidos(
      { desde: '2026-05-01', hasta: '2026-05-07', limite: 5 },
      USER,
    );

    const callArg = analyticsService.productosMasVendidos.mock.calls[0][1];
    expect(callArg).toBeDefined();
    expect(callArg!.desde).toBeInstanceOf(Date);
    expect(callArg!.hasta).toBeInstanceOf(Date);
    expect(callArg!.limite).toBe(5);
  });

  it('productosMasVendidos: pasa {} cuando opciones es undefined', async () => {
    analyticsService.productosMasVendidos.mockResolvedValue([]);

    await resolver.productosMasVendidos(undefined, USER);

    expect(analyticsService.productosMasVendidos).toHaveBeenCalledWith(USER.id, {});
  });

  it('ventasPorDia: delega al service', async () => {
    analyticsService.ventasPorDiaSemana.mockResolvedValue([
      { diaSemana: 1, nombreDia: 'Lunes', totalVentas: 30 },
    ]);
    const result = await resolver.ventasPorDia(undefined, USER);
    expect(result[0].nombreDia).toBe('Lunes');
  });

  it('resumenPeriodo: pasa userId del contexto', async () => {
    analyticsService.resumenPeriodo.mockResolvedValue({
      totalEntradas: 100,
      totalSalidas: 30,
      productosUnicos: 5,
      movimientosTotales: 15,
      promedioDiarioVentas: 10,
    });

    await resolver.resumenPeriodo(undefined, USER);

    expect(analyticsService.resumenPeriodo).toHaveBeenCalledWith(USER.id, {});
  });
});
