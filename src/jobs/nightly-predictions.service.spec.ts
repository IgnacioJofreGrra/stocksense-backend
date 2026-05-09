import { Test, type TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AlertaEmail } from '../notifications/notifications.types';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { NightlyPredictionsService } from './nightly-predictions.service';

const makeUser = (id: string, email: string, rol: UserRole = UserRole.DUENO) =>
  ({
    id,
    email,
    rol,
    nombre: 'Test',
    comercioNombre: `Comercio de ${email}`,
    activo: true,
    password: 'hash',
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as never; // entidad TypeORM con campos extra que no nos importan en tests.

const makePrediccionAlta = (overrides: Partial<{ productoId: string; nombre: string }> = {}) => ({
  productoId: overrides.productoId ?? 'p1',
  nombre: overrides.nombre ?? 'Coca Cola',
  ean13: '7790895000010',
  stockActual: 3,
  consumoPromedioDiario: 5,
  diasHastaAgotamiento: 1,
  cantidadSugeridaReponer: 35,
  urgencia: 'alta' as const,
  razonamiento: 'sale rapido',
});

const makePrediccionMedia = () => ({
  ...makePrediccionAlta({ productoId: 'p2', nombre: 'Arroz' }),
  urgencia: 'media' as const,
  diasHastaAgotamiento: 7,
});

describe('NightlyPredictionsService', () => {
  let service: NightlyPredictionsService;
  let usersService: { findActiveDuenos: jest.Mock };
  let aiService: { predecirReposicion: jest.Mock };
  let notifications: { enviarAlertaStock: jest.Mock };
  let delaySpy: jest.SpyInstance;

  beforeEach(async () => {
    usersService = { findActiveDuenos: jest.fn() };
    aiService = { predecirReposicion: jest.fn() };
    notifications = { enviarAlertaStock: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NightlyPredictionsService,
        { provide: UsersService, useValue: usersService },
        { provide: AiService, useValue: aiService },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(NightlyPredictionsService);
    // Eliminamos el delay real entre usuarios para acelerar tests.
    // Reusamos esta misma referencia en los tests para verificar la cantidad
    // de invocaciones (un segundo jest.spyOn devuelve el mismo handle pero
    // resetea los counters internos de Jest).
    delaySpy = jest
      .spyOn(service as unknown as { delay: () => Promise<void> }, 'delay')
      .mockResolvedValue(undefined);
  });

  it('procesa solo duenos (UsersService ya filtra por rol)', async () => {
    usersService.findActiveDuenos.mockResolvedValue([makeUser('u1', 'a@x.com')]);
    aiService.predecirReposicion.mockResolvedValue([]);

    const resumen = await service.run();

    expect(usersService.findActiveDuenos).toHaveBeenCalledTimes(1);
    expect(aiService.predecirReposicion).toHaveBeenCalledWith('u1');
    expect(resumen.duenosProcesados).toBe(1);
  });

  it('genera AlertaEmail solo para predicciones con urgencia alta', async () => {
    usersService.findActiveDuenos.mockResolvedValue([makeUser('u1', 'dueno@x.com')]);
    aiService.predecirReposicion.mockResolvedValue([makePrediccionAlta(), makePrediccionMedia()]);

    const resumen = await service.run();

    expect(notifications.enviarAlertaStock).toHaveBeenCalledTimes(1);
    const alerta = (notifications.enviarAlertaStock.mock.calls as unknown as [AlertaEmail][])[0][0];
    expect(alerta.email).toBe('dueno@x.com');
    expect(alerta.productosUrgentes).toHaveLength(1);
    expect(alerta.productosUrgentes[0].nombre).toBe('Coca Cola');
    expect(resumen.duenosConAlertas).toBe(1);
    expect(resumen.emailsEnviados).toBe(1);
  });

  it('no envia email si no hay productos urgentes', async () => {
    usersService.findActiveDuenos.mockResolvedValue([makeUser('u1', 'a@x.com')]);
    aiService.predecirReposicion.mockResolvedValue([makePrediccionMedia()]);

    const resumen = await service.run();

    expect(notifications.enviarAlertaStock).not.toHaveBeenCalled();
    expect(resumen.duenosConAlertas).toBe(0);
    expect(resumen.emailsEnviados).toBe(0);
  });

  it('continua con otros duenos si uno falla', async () => {
    usersService.findActiveDuenos.mockResolvedValue([
      makeUser('u1', 'falla@x.com'),
      makeUser('u2', 'ok@x.com'),
    ]);
    aiService.predecirReposicion
      .mockRejectedValueOnce(new Error('Groq saturado'))
      .mockResolvedValueOnce([makePrediccionAlta()]);

    const resumen = await service.run();

    expect(aiService.predecirReposicion).toHaveBeenCalledTimes(2);
    expect(notifications.enviarAlertaStock).toHaveBeenCalledTimes(1);
    expect(resumen.errores).toBe(1);
    expect(resumen.emailsEnviados).toBe(1);
    expect(resumen.duenosProcesados).toBe(2);
  });

  it('respeta delay entre usuarios pero no en el ultimo', async () => {
    usersService.findActiveDuenos.mockResolvedValue([
      makeUser('u1', 'a@x.com'),
      makeUser('u2', 'b@x.com'),
      makeUser('u3', 'c@x.com'),
    ]);
    aiService.predecirReposicion.mockResolvedValue([]);

    await service.run();

    // 3 duenos -> 2 delays (entre 1-2 y entre 2-3, no despues del 3).
    expect(delaySpy).toHaveBeenCalledTimes(2);
  });

  it('retorna duracion en ms positiva', async () => {
    usersService.findActiveDuenos.mockResolvedValue([]);
    const resumen = await service.run();
    expect(resumen.duracionMs).toBeGreaterThanOrEqual(0);
  });
});
