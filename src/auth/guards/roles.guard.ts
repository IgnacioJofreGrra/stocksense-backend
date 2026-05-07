import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import { UserRole, User } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard: chequea que request.user.rol este en la lista declarada por
 * @Roles(...) en el handler.
 *
 * Orden de guards en el controller: @UseGuards(JwtAuthGuard, RolesGuard).
 * Primero JwtAuthGuard valida el token y poblara request.user; luego
 * RolesGuard usa ese user para decidir si permite o niega.
 *
 * getAllAndOverride: revisa primero el handler (mas especifico), luego la
 * clase. Asi un controller con @Roles('dueno') a nivel clase puede tener un
 * handler especifico con @Roles('empleado','dueno') que sobreescribe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles -> sin restriccion de rol (cualquier user autenticado pasa).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Igual que JwtAuthGuard: detectamos el tipo de contexto y extraemos
    // el request del lugar correspondiente (HTTP o GraphQL).
    const request =
      context.getType<'graphql'>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext<{ req: Request & { user?: User } }>().req
        : context.switchToHttp().getRequest<Request & { user?: User }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }
    if (!requiredRoles.includes(user.rol)) {
      throw new ForbiddenException('Rol insuficiente para acceder a este recurso');
    }
    return true;
  }
}
