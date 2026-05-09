import { Test, TestingModule } from '@nestjs/testing';
import { AiCacheService } from './ai-cache.service';

describe('AiCacheService', () => {
  let service: AiCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiCacheService],
    }).compile();
    service = module.get(AiCacheService);
  });

  it('buildKey genera la misma key para mismos params (orden distinto)', () => {
    const k1 = service.buildKey('user-1', 'predict', { a: 1, b: 2 });
    const k2 = service.buildKey('user-1', 'predict', { b: 2, a: 1 });
    expect(k1).toBe(k2);
  });

  it('buildKey genera keys distintas si cambia el user', () => {
    const k1 = service.buildKey('user-1', 'predict', {});
    const k2 = service.buildKey('user-2', 'predict', {});
    expect(k1).not.toBe(k2);
  });

  it('get retorna null si la key no existe', () => {
    expect(service.get('nada')).toBeNull();
  });

  it('set/get round-trip', () => {
    service.set('k', { hola: 'mundo' });
    expect(service.get('k')).toEqual({ hola: 'mundo' });
  });

  it('expira la entrada despues del TTL', () => {
    service.set('k', 'valor', 50);
    expect(service.get<string>('k')).toBe('valor');
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(service.get('k')).toBeNull();
        resolve();
      }, 80);
    });
  });

  it('invalidateUser borra todas las keys del user (y solo esas)', () => {
    const k1 = service.buildKey('user-1', 'a', {});
    const k2 = service.buildKey('user-1', 'b', {});
    const k3 = service.buildKey('user-2', 'a', {});
    service.set(k1, 'v1');
    service.set(k2, 'v2');
    service.set(k3, 'v3');
    const borradas = service.invalidateUser('user-1');
    expect(borradas).toBe(2);
    expect(service.get(k1)).toBeNull();
    expect(service.get(k2)).toBeNull();
    expect(service.get(k3)).toBe('v3');
  });

  it('onStockMovimiento listener invalida el cache del user', () => {
    const k = service.buildKey('user-1', 'predict', {});
    service.set(k, 'algo');
    service.onStockMovimiento({ userId: 'user-1' });
    expect(service.get(k)).toBeNull();
  });
});
