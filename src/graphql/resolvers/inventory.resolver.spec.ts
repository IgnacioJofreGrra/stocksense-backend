import { Test, TestingModule } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { InventoryService } from '../../inventory/inventory.service';
import { StockMovement, StockMovementType } from '../../inventory/entities/stock-movement.entity';
import { Product } from '../../products/entities/product.entity';
import { User, UserRole } from '../../users/entities/user.entity';
import { PUB_SUB } from '../pubsub/pubsub.constants';
import { InventoryResolver } from './inventory.resolver';

describe('InventoryResolver', () => {
  let resolver: InventoryResolver;
  let inventoryService: jest.Mocked<InventoryService>;
  let pubSub: jest.Mocked<PubSub>;

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
        InventoryResolver,
        {
          provide: InventoryService,
          useValue: {
            calcularStock: jest.fn(),
            obtenerAlertas: jest.fn(),
            obtenerMovimientos: jest.fn(),
            registrarEntrada: jest.fn(),
            registrarSalida: jest.fn(),
            registrarAjuste: jest.fn(),
          },
        },
        {
          provide: PUB_SUB,
          useValue: {
            asyncIterableIterator: jest.fn(),
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get(InventoryResolver);
    inventoryService = module.get(InventoryService);
    pubSub = module.get(PUB_SUB);
  });

  it('registrarEntrada: arma ActorContext desde el user y delega', async () => {
    inventoryService.registrarEntrada.mockResolvedValue({
      movimiento: { id: 'm1', tipo: StockMovementType.ENTRADA, cantidad: 10 } as StockMovement,
      stockActual: 10,
    });

    await resolver.registrarEntrada({ productId: 'p1', cantidad: 10 }, USER);

    expect(inventoryService.registrarEntrada).toHaveBeenCalledWith(
      { productId: 'p1', cantidad: 10 },
      { userId: USER.id, comercioNombre: USER.comercioNombre },
    );
  });

  it('registrarSalida: pasa el actor con comercioNombre del user', async () => {
    inventoryService.registrarSalida.mockResolvedValue({
      movimiento: { id: 'm1', tipo: StockMovementType.SALIDA, cantidad: 5 } as StockMovement,
      stockActual: 5,
    });

    await resolver.registrarSalida({ productId: 'p1', cantidad: 5 }, USER);

    const callArg = inventoryService.registrarSalida.mock.calls[0][1];
    expect(callArg.comercioNombre).toBe('Almacen Test');
  });

  it('alertasStock: mapea AlertaStock a la forma del ObjectType', async () => {
    inventoryService.obtenerAlertas.mockResolvedValue([
      {
        producto: { id: 'p1', nombre: 'Coca' } as Product,
        stockActual: 2,
        stockMinimo: 5,
        diferencia: -3,
      },
    ]);

    const result = await resolver.alertasStock(USER);

    expect(result).toHaveLength(1);
    expect(result[0].diferencia).toBe(-3);
  });

  it('alertaStockBajo (subscription): retorna el async iterator del PUB_SUB', () => {
    const fakeIterator = {
      next: () => Promise.resolve({ done: true, value: undefined }),
    } as unknown as ReturnType<PubSub['asyncIterableIterator']>;
    pubSub.asyncIterableIterator.mockReturnValue(fakeIterator);

    const result = resolver.alertaStockBajo();

    expect(pubSub.asyncIterableIterator).toHaveBeenCalledWith('ALERTA_STOCK_BAJO');
    expect(result).toBe(fakeIterator);
  });
});
