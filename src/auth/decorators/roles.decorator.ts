import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * @Roles(UserRole.DUENO, UserRole.EMPLEADO) sobre un handler le dice al
 * RolesGuard cuales roles tienen permitido acceder.
 *
 * SetMetadata almacena el array bajo la key 'roles' en la metadata del
 * handler. RolesGuard la lee con Reflector.
 *
 * Si no se aplica @Roles, RolesGuard interpreta "no hay restriccion de rol"
 * (acceso a cualquier user autenticado, no a anonimos -> JwtAuthGuard sigue
 * filtrando antes).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
