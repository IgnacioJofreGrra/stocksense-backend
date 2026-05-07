import { Test, TestingModule } from '@nestjs/testing';
import { PubSub } from 'graphql-subscriptions';
import { Product } from '../../products/entities/product.entity';
import { StockAlertaBajaEvent } from '../../inventory/inventory.service';
import { ALERTA_STOCK_BAJO_TRIGGER, PUB_SUB } from './pubsub.constants';
import { StockAlertListener } from './stock-alert.listener';

describe('StockAlertListener', () => {
  let listener: StockAlertListener;
  let pubSub: jest.Mocked<PubSub>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockAlertListener,
        {
          provide: PUB_SUB,
          useValue: { publish: jest.fn() },
        },
      ],
    }).compile();
    listener = module.get(StockAlertListener);
    pubSub = module.get(PUB_SUB);
  });

  it('debería publicar al PubSub con el shape esperado por la subscription', async () => {
    const producto = { id: 'p1', nombre: 'Coca', stockMinimo: 5 } as Product;
    const event: StockAlertaBajaEvent = {
      producto,
      stockActual: 2,
      stockMinimo: 5,
      diferencia: -3,
      userId: 'user-1',
    };

    await listener.onAlertaStockBaja(event);

    expect(pubSub.publish).toHaveBeenCalledWith(ALERTA_STOCK_BAJO_TRIGGER, {
      alertaStockBajo: {
        producto,
        stockActual: 2,
        stockMinimo: 5,
        diferencia: -3,
      },
      _meta: { userId: 'user-1' },
    });
  });
});
