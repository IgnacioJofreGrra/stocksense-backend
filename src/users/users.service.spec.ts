import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserData, UsersService } from './users.service';

/**
 * Tests unitarios de UsersService.
 *
 * El Repository<User> de TypeORM esta mockeado: no tocamos BD. La logica que
 * probamos aqui es solo la del service (que hoy es delgada, pero crece con
 * los modulos de productos/inventario).
 */
describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('debería crear un usuario con rol empleado por defecto', async () => {
      const data: CreateUserData = {
        email: 'empleado@test.com',
        password: 'hash-bcrypt',
        nombre: 'Empleado Test',
        comercioNombre: 'Almacen Test',
      };
      // Sin rol explicito en data; la BD aplica default 'empleado' (definido
      // en la entidad). Simulamos ese comportamiento en el mock de save.
      repository.create.mockReturnValue(data as User);
      repository.save.mockResolvedValue({
        ...(data as User),
        id: '11111111-1111-1111-1111-111111111111',
        rol: UserRole.EMPLEADO,
        activo: true,
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const created = await service.create(data);

      expect(repository.create).toHaveBeenCalledWith(data);
      // El service no debe inyectar rol por su cuenta -> data sigue sin rol.
      expect((data as Partial<User>).rol).toBeUndefined();
      // Lo que retorna la BD si tiene rol = 'empleado' por default.
      expect(created.rol).toBe(UserRole.EMPLEADO);
    });
  });

  describe('findByEmail', () => {
    it('debería encontrar usuario por email', async () => {
      const fakeUser = {
        id: 'abc',
        email: 'buscar@test.com',
        password: 'hash',
        nombre: 'X',
        rol: UserRole.DUENO,
        comercioNombre: 'Y',
        activo: true,
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
      repository.findOne.mockResolvedValue(fakeUser);

      const found = await service.findByEmail('buscar@test.com');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'buscar@test.com' },
      });
      expect(found).toEqual(fakeUser);
    });

    it('debería retornar null si el email no existe', async () => {
      repository.findOne.mockResolvedValue(null);
      const found = await service.findByEmail('noexiste@test.com');
      expect(found).toBeNull();
    });
  });

  describe('updateProfile', () => {
    const buildFakeUser = (overrides: Partial<User> = {}): User => ({
      id: 'user-1',
      email: 'juan@test.com',
      password: 'hash',
      nombre: 'Juan',
      rol: UserRole.EMPLEADO,
      comercioNombre: 'Almacen',
      activo: true,
      refreshToken: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it('debería actualizar nombre y comercioNombre', async () => {
      const user = buildFakeUser();
      repository.findOne.mockResolvedValue(user);
      repository.save.mockImplementation((entity) => Promise.resolve(entity as User));

      const result = await service.updateProfile('user-1', {
        nombre: 'Juan Nuevo',
        comercioNombre: 'Almacen Nuevo',
      });

      expect(result.nombre).toBe('Juan Nuevo');
      expect(result.comercioNombre).toBe('Almacen Nuevo');
      expect(repository.save).toHaveBeenCalledWith(user);
    });

    it('debería actualizar solo el campo enviado y dejar el otro intacto', async () => {
      const user = buildFakeUser({ nombre: 'Original', comercioNombre: 'Original SA' });
      repository.findOne.mockResolvedValue(user);
      repository.save.mockImplementation((entity) => Promise.resolve(entity as User));

      const result = await service.updateProfile('user-1', { nombre: 'Solo Nombre' });

      expect(result.nombre).toBe('Solo Nombre');
      expect(result.comercioNombre).toBe('Original SA');
    });

    it('debería devolver el user sin cambios si data llega vacio', async () => {
      const user = buildFakeUser();
      repository.findOne.mockResolvedValue(user);

      const result = await service.updateProfile('user-1', {});

      expect(result).toEqual(user);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('debería actualizar password e invalidar refreshToken', async () => {
      await service.updatePassword('user-1', 'nuevo-hash-bcrypt');

      expect(repository.update).toHaveBeenCalledWith('user-1', {
        password: 'nuevo-hash-bcrypt',
        refreshToken: null,
      });
    });
  });
});
