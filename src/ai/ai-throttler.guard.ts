import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import { User } from '../users/entities/user.entity';

/**
 * AiThrottlerGuard — variante del ThrottlerGuard que rastrea por userId
 * en vez de por IP.
 *
 * Por que: el plan gratuito de Groq se mide por API key (la nuestra),
 * no por cliente. Si un solo usuario malicioso saturara con 1000 calls,
 * dejaria a TODOS los demas sin servicio. Limitar por user (3/min, 30/h)
 * mantiene el costo y la disponibilidad bajo control.
 *
 * Si no hay user en el request (caso ralo: ruta sin guard auth previo),
 * cae a la IP — comportamiento default.
 *
 * Tambien soporta GraphQL: extrae el request del contexto GQL si aplica.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: User }).user;
    if (user?.id) return Promise.resolve(`user:${user.id}`);
    // Fallback al tracker por IP del padre.
    return super.getTracker(req);
  }

  /**
   * En GraphQL el request vive en el contexto Apollo, no en el de Express.
   * Sobreescribimos getRequestResponse para que el throttler encuentre el
   * request en ambos transportes.
   */
  protected override getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: Record<string, unknown>;
  } {
    if (context.getType<'graphql'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext<{ req: Request }>();
      return { req: ctx.req as unknown as Record<string, unknown>, res: {} };
    }
    return super.getRequestResponse(context);
  }

  /**
   * Customizamos el mensaje del 429: por default el throttler dice "ThrottlerException:
   * Too Many Requests" generico. Damos contexto util.
   */
  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const segundos = Math.ceil(detail.timeToBlockExpire);
    return Promise.reject(
      new HttpException(
        `Limite de consultas de IA alcanzado. Reintentar en ${segundos}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  }
}
