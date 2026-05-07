import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/**
 * JwtAuthGuard: valida access token tanto en HTTP (REST) como en GraphQL.
 *
 * Por que un solo guard para ambos protocolos:
 * - @UseGuards(JwtAuthGuard) funciona igual en controllers REST y en
 *   resolvers GraphQL. Sin esto, tendriamos que duplicar como GqlAuthGuard
 *   y mantener dos guards en paralelo.
 *
 * El truco: passport-jwt extrae el token de `request.headers.authorization`.
 * Sobreescribimos getRequest() para devolver el request correcto segun el
 * tipo de contexto:
 * - REST: el request de Express (HTTP).
 * - GraphQL: el request guardado en el contexto GQL (que en AppModule
 *   normalizamos para tener `headers.authorization` tanto en queries HTTP
 *   como en subscriptions WebSocket).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): Request {
    if (context.getType<'graphql'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return gqlCtx.getContext<{ req: Request }>().req;
    }
    return context.switchToHttp().getRequest<Request>();
  }
}
