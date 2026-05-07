import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';

/**
 * @CurrentUser() en un handler te da el user autenticado.
 *
 * Universal: funciona en controllers REST y resolvers GraphQL.
 *
 *   // REST
 *   @Get('profile')
 *   profile(@CurrentUser() user: User) { return user; }
 *
 *   // GraphQL
 *   @Query()
 *   me(@CurrentUser() user: User) { return user; }
 *
 * Detectamos el tipo de contexto con ctx.getType(). En GraphQL, el request
 * vive en el context de Apollo (ctx.getContext().req). En HTTP, en el
 * request de Express. JwtAuthGuard ya pobl o request.user en ambos casos.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  if (ctx.getType<'graphql'>() === 'graphql') {
    const gqlCtx = GqlExecutionContext.create(ctx);
    return gqlCtx.getContext<{ req: Request & { user: User } }>().req.user;
  }
  const request = ctx.switchToHttp().getRequest<Request & { user: User }>();
  return request.user;
});
