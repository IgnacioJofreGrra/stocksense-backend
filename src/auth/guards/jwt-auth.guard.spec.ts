import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Tests del JwtAuthGuard universal.
 *
 * Verificamos que getRequest() devuelve el request del lugar correcto
 * segun el tipo de contexto (HTTP o GraphQL). Asi passport-jwt encuentra
 * el header Authorization en ambos casos.
 */
describe('JwtAuthGuard (universal)', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('en contexto HTTP, retorna el request de switchToHttp()', () => {
    const httpReq = { headers: { authorization: 'Bearer xxx' } };
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => httpReq }),
    } as unknown as ExecutionContext;

    const req = guard.getRequest(ctx);

    expect(req).toBe(httpReq);
  });

  it('en contexto GraphQL, retorna ctx.getContext().req', () => {
    const gqlReq = { headers: { authorization: 'Bearer yyy' } };
    // GqlExecutionContext.create lee getArgs/getClass/getHandler/getType del
    // ExecutionContext base para construir su wrapper. Pasamos lo minimo.
    // En GraphQL, los args de un resolver son [parent, args, context, info];
    // el context (con req) esta en index 2.
    const args = [{}, {}, { req: gqlReq }, {}];
    const ctx = {
      getType: () => 'graphql',
      getArgs: () => args,
      getArgByIndex: (i: number) => args[i],
      getClass: () => class FakeResolver {},
      getHandler: () => function fakeHandler() {},
    } as unknown as ExecutionContext;

    const req = guard.getRequest(ctx);

    expect(req).toBe(gqlReq);
  });
});
