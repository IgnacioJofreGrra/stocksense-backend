import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

/**
 * Datos para crear un usuario nuevo.
 *
 * Tipado independiente del DTO de Auth: UsersService no conoce Auth.
 * Asi UsersModule queda reusable si manana otro modulo necesita crear users
 * (ej. seed de datos, admin panel).
 */
export interface CreateUserData {
  email: string;
  password: string; // ya hasheado por AuthService
  nombre: string;
  comercioNombre: string;
  rol?: UserRole;
}

/**
 * UsersService: acceso a la tabla `users`.
 *
 * Por que no fusionar con AuthService:
 * - Single Responsibility: UsersService solo sabe de CRUD de usuarios.
 *   AuthService sabe de credenciales, tokens, sesiones.
 * - Testeabilidad: en tests de Auth podemos mockear UsersService sin
 *   simular toda la capa de BD.
 * - Reuso: cuando agreguemos endpoints administrativos de usuarios
 *   (ej. listar empleados de un comercio), reusamos este servicio.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Busca un usuario por email. Retorna null si no existe.
   * Lo usa AuthService.login y register (validar duplicados).
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * Busca un usuario por ID. Retorna null si no existe.
   * Lo usa la JwtStrategy para hidratar el request con el user actual.
   */
  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Lista todos los duenos activos. Usado por el job nocturno para
   * recorrer los comercios y generar predicciones/alertas por email.
   * Empleados quedan fuera porque la "inteligencia del negocio" es del dueno.
   */
  async findActiveDuenos(): Promise<User[]> {
    return this.usersRepository.find({
      where: { rol: UserRole.DUENO, activo: true },
    });
  }

  /**
   * Crea un usuario nuevo. AuthService ya debe haber hasheado el password.
   * El rol default es 'empleado' (definido en la entidad, no aqui).
   */
  async create(data: CreateUserData): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  /**
   * Guarda el hash del refresh token actual (o null al hacer logout).
   * Mantenerlo en BD permite invalidar sesiones del lado del servidor:
   * si el user hace logout o detectamos abuso, el refresh deja de funcionar
   * aunque el atacante tenga el token.
   */
  async updateRefreshToken(id: string, hashedToken: string | null): Promise<void> {
    await this.usersRepository.update(id, { refreshToken: hashedToken });
  }

  /**
   * Actualiza campos de perfil (nombre, comercioNombre). Si el cliente no
   * envia ningun campo, retorna el usuario sin tocarlo. Email/rol/password
   * NO se cambian aqui — flujos aparte.
   */
  async updateProfile(
    id: string,
    data: { nombre?: string; comercioNombre?: string },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      // No deberia pasar: el JWT acaba de validar al user. Lo tipamos defensivo.
      throw new Error(`Usuario ${id} no encontrado`);
    }
    const cambios: Partial<User> = {};
    if (data.nombre !== undefined) cambios.nombre = data.nombre;
    if (data.comercioNombre !== undefined) cambios.comercioNombre = data.comercioNombre;
    if (Object.keys(cambios).length === 0) {
      return user;
    }
    Object.assign(user, cambios);
    return this.usersRepository.save(user);
  }

  /**
   * Reemplaza el hash de password. Tambien deja refreshToken en null para
   * forzar re-login en todas las sesiones (defensa: si la contrasena cambia,
   * sesiones viejas no deberian sobrevivir).
   */
  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(id, {
      password: hashedPassword,
      refreshToken: null,
    });
  }
}
