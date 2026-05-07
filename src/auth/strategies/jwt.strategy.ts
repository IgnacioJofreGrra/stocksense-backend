import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { User, UserRole } from '../../users/entities/user.entity';

/**
 * Payload firmado en cada access token.
 * - sub: subject. Estandar JWT para identificar al usuario.
 * - email/rol: redundantes con la BD pero utiles para guards y logs sin
 *   tener que hacer otra query.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  rol: UserRole;
}

/**
 * JwtStrategy: la usa Passport para validar el access token en cada request
 * protegido. Pasos:
 * 1. Extrae el token del header Authorization: Bearer xxx.
 * 2. Verifica firma con JWT_SECRET y que no este expirado (passport-jwt lo hace).
 * 3. Llama validate() con el payload decodificado.
 * 4. validate() retorna el user; NestJS lo adjunta a request.user.
 *
 * Decision: validate() consulta BD para verificar que el user sigue activo.
 * Trade-off: +1 query por request autenticado, pero permite invalidar
 * sesiones (ej. desactivar empleado) sin esperar a que el JWT expire.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? '',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario no autorizado');
    }
    return user;
  }
}
