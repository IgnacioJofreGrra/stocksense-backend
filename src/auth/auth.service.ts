import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { StringValue } from 'ms';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SafeUser, TokenResponse } from './dto/token-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 10;

/**
 * AuthService: orquesta registro, login, refresh y logout.
 *
 * Decisiones:
 * - bcrypt 10 rounds para passwords (~100ms): balance UX/seguridad estandar.
 * - Refresh token = JWT firmado, payload solo {sub}, exp 7d. Permite
 *   identificar al user sin pedirle userId aparte en /auth/refresh.
 * - El hash SHA-256 del refresh token se guarda en BD. Al hacer logout o
 *   rotar, se invalida server-side.
 * - SHA-256 (no bcrypt) para refresh tokens: bcrypt tiene cap 72 bytes y
 *   los JWTs lo superan; ademas, los JWTs ya tienen alta entropia, no
 *   necesitan el slow-hash de bcrypt.
 * - Rotacion de refresh token: cada uso genera un par nuevo. Si un atacante
 *   robo el token, el usuario legitimo lo deja invalido al refrescar.
 * - Mensaje "Credenciales invalidas" intencional en login (no decimos si el
 *   email existe o no). Mitiga enumeracion de usuarios.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      nombre: dto.nombre,
      comercioNombre: dto.comercioNombre,
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.activo) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.configService.get<string>('jwt.secret') ?? '',
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.activo || !user.refreshToken) {
      throw new UnauthorizedException('Refresh token invalido');
    }
    if (!this.compareTokenHash(refreshToken, user.refreshToken)) {
      throw new UnauthorizedException('Refresh token invalido');
    }
    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null);
  }

  /**
   * Actualiza nombre/comercioNombre. Devuelve el SafeUser resultante.
   * Si el body llega sin campos, devuelve el user sin cambios (no error).
   */
  async updateProfile(
    userId: string,
    data: { nombre?: string; comercioNombre?: string },
  ): Promise<SafeUser> {
    const user = await this.usersService.updateProfile(userId, data);
    return this.toSafeUser(user);
  }

  /**
   * Cambia la contrasena. Verifica la actual con bcrypt.compare; si OK,
   * hashea la nueva y la persiste. Tambien invalida refreshToken para
   * forzar re-login (decision: cambio de password = sesiones previas mueren).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Contrasena actual incorrecta');
    }
    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.usersService.updatePassword(userId, hashed);
  }

  /**
   * Genera un nuevo par access+refresh, persiste el hash del refresh y
   * arma la respuesta sanitizada.
   */
  private async issueTokens(user: User): Promise<TokenResponse> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
    };
    // expiresIn requiere el tipo StringValue de `ms` (no string generico).
    // El cast es seguro porque las env vars siguen el formato '15m' | '7d' etc.
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>('jwt.secret') ?? '',
      expiresIn: (this.configService.get<string>('jwt.expiration') ?? '15m') as StringValue,
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id },
      {
        secret: this.configService.get<string>('jwt.secret') ?? '',
        expiresIn: (this.configService.get<string>('jwt.refreshExpiration') ?? '7d') as StringValue,
      },
    );
    await this.usersService.updateRefreshToken(user.id, this.hashToken(refreshToken));
    return {
      user: this.toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Compara hashes con timingSafeEqual: tiempo constante respecto al input.
   * Una comparacion `===` filtraria el primer byte distinto via timing,
   * permitiendo a un atacante recuperar el hash byte por byte.
   */
  private compareTokenHash(plainToken: string, storedHash: string): boolean {
    const incoming = Buffer.from(this.hashToken(plainToken), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    if (incoming.length !== stored.length) {
      return false;
    }
    return timingSafeEqual(incoming, stored);
  }

  private toSafeUser(user: User): SafeUser {
    // Destructuring explicito: si manana agregamos un campo sensible a User,
    // TS no nos avisa de no devolverlo. Por eso lo armamos campo por campo.
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      comercioNombre: user.comercioNombre,
      activo: user.activo,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
