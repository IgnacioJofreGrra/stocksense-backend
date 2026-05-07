import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

/**
 * Tests unitarios de AuthService.
 *
 * Mockeamos UsersService, JwtService y ConfigService. No tocamos BD ni
 * firmamos tokens reales. bcrypt si es real porque es puro CPU; mockearlo
 * complicaria los tests sin beneficio.
 */
describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  // Helper para construir un User completo en los tests.
  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'juan@almacen.com',
    password: '',
    nombre: 'Juan',
    rol: UserRole.EMPLEADO,
    comercioNombre: 'Almacen Don Juan',
    activo: true,
    refreshToken: null,
    createdAt: new Date('2026-05-07T00:00:00Z'),
    updatedAt: new Date('2026-05-07T00:00:00Z'),
    ...overrides,
  });

  // Helper: lo mismo que el hashToken privado del service.
  const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            updateRefreshToken: jest.fn(),
            updateProfile: jest.fn(),
            updatePassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string): string => {
              const values: Record<string, string> = {
                'jwt.secret': 'test-secret-32-chars-minimo-xxxxxx',
                'jwt.expiration': '15m',
                'jwt.refreshExpiration': '7d',
              };
              return values[key] ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('debería registrar un usuario nuevo correctamente', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const created = buildUser({ password: await bcrypt.hash('secreto123', 10) });
      usersService.create.mockResolvedValue(created);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token-fake')
        .mockResolvedValueOnce('refresh-token-fake');

      const result = await service.register({
        email: 'juan@almacen.com',
        password: 'secreto123',
        nombre: 'Juan',
        comercioNombre: 'Almacen Don Juan',
      });

      expect(usersService.create).toHaveBeenCalledTimes(1);
      // El password recibido por create() debe ser un hash bcrypt, no el plano.
      const createCall = usersService.create.mock.calls[0][0];
      expect(createCall.password).not.toBe('secreto123');
      expect(createCall.password.startsWith('$2')).toBe(true);

      expect(result.accessToken).toBe('access-token-fake');
      expect(result.refreshToken).toBe('refresh-token-fake');
      // La respuesta no debe incluir password ni refreshToken interno.
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('refreshToken');

      // El hash del refresh token se persiste en BD.
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        created.id,
        hashToken('refresh-token-fake'),
      );
    });

    it('debería rechazar registro con email duplicado', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({
          email: 'juan@almacen.com',
          password: 'secreto123',
          nombre: 'Juan',
          comercioNombre: 'X',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('debería hacer login con credenciales válidas', async () => {
      const passwordHash = await bcrypt.hash('secreto123', 10);
      usersService.findByEmail.mockResolvedValue(buildUser({ password: passwordHash }));
      jwtService.signAsync
        .mockResolvedValueOnce('access-login')
        .mockResolvedValueOnce('refresh-login');

      const result = await service.login({
        email: 'juan@almacen.com',
        password: 'secreto123',
      });

      expect(result.accessToken).toBe('access-login');
      expect(result.refreshToken).toBe('refresh-login');
    });

    it('debería rechazar login con password incorrecto', async () => {
      const passwordHash = await bcrypt.hash('secreto123', 10);
      usersService.findByEmail.mockResolvedValue(buildUser({ password: passwordHash }));

      await expect(
        service.login({ email: 'juan@almacen.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('debería rechazar login si el usuario no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'fantasma@x.com', password: 'cualquiera' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('debería rechazar login si el usuario está desactivado', async () => {
      const passwordHash = await bcrypt.hash('secreto123', 10);
      usersService.findByEmail.mockResolvedValue(
        buildUser({ password: passwordHash, activo: false }),
      );

      await expect(
        service.login({ email: 'juan@almacen.com', password: 'secreto123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('debería refrescar tokens correctamente', async () => {
      const oldRefresh = 'old.refresh.jwt';
      const user = buildUser({ refreshToken: hashToken(oldRefresh) });
      jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
      usersService.findById.mockResolvedValue(user);
      jwtService.signAsync
        .mockResolvedValueOnce('access-rotated')
        .mockResolvedValueOnce('refresh-rotated');

      const result = await service.refresh(oldRefresh);

      expect(result.accessToken).toBe('access-rotated');
      expect(result.refreshToken).toBe('refresh-rotated');
      // Rotacion: el nuevo hash queda persistido (invalida el viejo).
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        hashToken('refresh-rotated'),
      );
    });

    it('debería rechazar refresh token inválido (firma malformada)', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      await expect(service.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('debería rechazar refresh token que no coincide con el hash en BD', async () => {
      const incoming = 'token-incoming.jwt';
      // El hash en BD corresponde a OTRO token -> mismatch al comparar.
      const user = buildUser({ refreshToken: hashToken('different-token.jwt') });
      jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
      usersService.findById.mockResolvedValue(user);

      await expect(service.refresh(incoming)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('debería rechazar refresh si el usuario hizo logout (refreshToken null)', async () => {
      const user = buildUser({ refreshToken: null });
      jwtService.verifyAsync.mockResolvedValue({ sub: user.id });
      usersService.findById.mockResolvedValue(user);

      await expect(service.refresh('any.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('debería invalidar refresh token en logout', async () => {
      await service.logout('user-uuid');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith('user-uuid', null);
    });
  });

  describe('updateProfile', () => {
    it('debería actualizar nombre y devolver SafeUser sin password', async () => {
      const updated = buildUser({ nombre: 'Juan Editado' });
      usersService.updateProfile.mockResolvedValue(updated);

      const result = await service.updateProfile(updated.id, { nombre: 'Juan Editado' });

      expect(usersService.updateProfile).toHaveBeenCalledWith(updated.id, {
        nombre: 'Juan Editado',
      });
      expect(result.nombre).toBe('Juan Editado');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('debería actualizar comercioNombre', async () => {
      const updated = buildUser({ comercioNombre: 'Almacen El Sol' });
      usersService.updateProfile.mockResolvedValue(updated);

      const result = await service.updateProfile(updated.id, {
        comercioNombre: 'Almacen El Sol',
      });

      expect(usersService.updateProfile).toHaveBeenCalledWith(updated.id, {
        comercioNombre: 'Almacen El Sol',
      });
      expect(result.comercioNombre).toBe('Almacen El Sol');
    });
  });

  describe('changePassword', () => {
    const USER_ID = '11111111-1111-1111-1111-111111111111';

    it('debería cambiar la contrasena con currentPassword correcta', async () => {
      const passwordHash = await bcrypt.hash('actual1234', 10);
      usersService.findById.mockResolvedValue(buildUser({ password: passwordHash }));

      await service.changePassword(USER_ID, 'actual1234', 'nueva-segura');

      expect(usersService.updatePassword).toHaveBeenCalledTimes(1);
      const [calledId, hashed] = usersService.updatePassword.mock.calls[0];
      expect(calledId).toBe(USER_ID);
      expect(hashed.startsWith('$2')).toBe(true);
      // Sanity: el hash guardado debe verificar contra la nueva contrasena.
      expect(await bcrypt.compare('nueva-segura', hashed)).toBe(true);
    });

    it('debería rechazar si la currentPassword no coincide', async () => {
      const passwordHash = await bcrypt.hash('actual1234', 10);
      usersService.findById.mockResolvedValue(buildUser({ password: passwordHash }));

      await expect(
        service.changePassword(USER_ID, 'incorrecta', 'nueva-segura'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('debería rechazar si el usuario no existe', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.changePassword(USER_ID, 'actual1234', 'nueva-segura'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });
  });
});
