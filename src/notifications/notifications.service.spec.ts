import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import type { AlertaEmail } from './notifications.types';

const alertaBase: AlertaEmail = {
  userId: 'user-1',
  email: 'dueno@almacen.com',
  comercioNombre: 'Almacen Don Juan',
  productosUrgentes: [
    {
      nombre: 'Coca Cola 2.5L',
      ean13: '7790895000010',
      stockActual: 3,
      diasHastaAgotamiento: 1,
      cantidadSugeridaReponer: 35,
    },
    {
      nombre: 'Arroz 1kg',
      ean13: '7790895000027',
      stockActual: 2,
      diasHastaAgotamiento: 2,
      cantidadSugeridaReponer: 20,
    },
  ],
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = { get: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: ConfigService, useValue: configService }],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('enviarAlertaStock', () => {
    it('no hace nada si no hay productos urgentes', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.enviarAlertaStock({
        ...alertaBase,
        productosUrgentes: [],
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('en desarrollo loguea sin intentar SES', async () => {
      // Sin AWS_SES_REGION ni FROM_EMAIL ni production -> log only.
      configService.get.mockReturnValue(undefined);
      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.enviarAlertaStock(alertaBase);
      expect(logSpy).toHaveBeenCalled();
      // El primer log incluye el destinatario y la cantidad de productos.
      expect(logSpy.mock.calls[0][0]).toContain('dueno@almacen.com');
      expect(logSpy.mock.calls[0][0]).toContain('productos=2');
    });

    it('escapa caracteres HTML peligrosos en nombre del comercio', () => {
      configService.get.mockReturnValue(undefined);
      const html = service['generarHtmlAlerta']({
        ...alertaBase,
        comercioNombre: '<script>alert(1)</script>',
      });
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('genera asunto con la cantidad de productos urgentes', () => {
      const subject = service['generarAsunto'](alertaBase);
      expect(subject).toContain('Almacen Don Juan');
      expect(subject).toContain('2 producto');
    });

    it('genera texto plano con todos los productos', () => {
      const texto = service['generarTextoPlano'](alertaBase);
      expect(texto).toContain('Coca Cola 2.5L');
      expect(texto).toContain('Arroz 1kg');
      expect(texto).toContain('Stock: 3');
      expect(texto).toContain('Reponer: 35');
    });

    it('en produccion sin config SES cae a modo log (no crashea)', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });
      const logSpy = jest.spyOn(service['logger'], 'log');
      await expect(service.enviarAlertaStock(alertaBase)).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
