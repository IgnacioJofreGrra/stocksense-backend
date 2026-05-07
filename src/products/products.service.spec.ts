import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductOrderBy, QueryProductDto, SortOrder } from './dto/query-product.dto';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

/**
 * Tests unitarios de ProductsService.
 *
 * Mockeamos Repository<Product> y, cuando se usa, su QueryBuilder.
 * No tocamos BD: aqui validamos solo la logica del service (chequeos de
 * conflictos, propagacion de userId, manejo de no-encontrados).
 */
describe('ProductsService', () => {
  let service: ProductsService;
  let repository: jest.Mocked<Repository<Product>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<Product>>;

  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const OTHER_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const PRODUCT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const buildProduct = (overrides: Partial<Product> = {}): Product => ({
    id: PRODUCT_ID,
    ean13: '7501031311309',
    nombre: 'Coca Cola 2.5L',
    descripcion: null,
    categoria: 'Bebidas',
    precioCompra: 1500,
    precioVenta: 2000,
    unidadMedida: 'unidad',
    stockMinimo: 5,
    imagenUrl: null,
    activo: true,
    userId: USER_ID,
    createdAt: new Date('2026-05-07T00:00:00Z'),
    updatedAt: new Date('2026-05-07T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    // Mock encadenable del QueryBuilder. Cada metodo retorna `this` (el mock)
    // para que las llamadas se puedan encadenar como en el codigo real.
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Product>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get(ProductsService);
    repository = module.get(getRepositoryToken(Product));
  });

  describe('crear', () => {
    const dto: CreateProductDto = {
      ean13: '7501031311309',
      nombre: 'Coca Cola 2.5L',
    };

    it('debería crear un producto con EAN-13 válido', async () => {
      repository.findOne.mockResolvedValue(null);
      const created = buildProduct();
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.crear(dto, USER_ID);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { ean13: dto.ean13, userId: USER_ID },
      });
      expect(repository.create).toHaveBeenCalledWith({ ...dto, userId: USER_ID });
      expect(result).toEqual(created);
    });

    it('debería rechazar creación con EAN-13 duplicado para el mismo usuario', async () => {
      repository.findOne.mockResolvedValue(buildProduct());

      await expect(service.crear(dto, USER_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('debería permitir el mismo EAN-13 para usuarios distintos', async () => {
      // findOne respeta el userId del filtro: para USER_ID-2, no encuentra nada.
      repository.findOne.mockImplementation((options): Promise<Product | null> => {
        const where = (options as { where: { userId: string } }).where;
        return Promise.resolve(where.userId === USER_ID ? buildProduct() : null);
      });
      const newProduct = buildProduct({ id: 'nuevo-id', userId: OTHER_USER_ID });
      repository.create.mockReturnValue(newProduct);
      repository.save.mockResolvedValue(newProduct);

      // El mismo EAN para OTHER_USER_ID se crea sin problema.
      await expect(service.crear(dto, OTHER_USER_ID)).resolves.toEqual(newProduct);
      // Y para USER_ID, el mismo EAN choca.
      await expect(service.crear(dto, USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('buscarTodos', () => {
    it('debería listar productos paginados del usuario', async () => {
      const products = [buildProduct(), buildProduct({ id: 'otro', ean13: '5901234123457' })];
      queryBuilder.getManyAndCount.mockResolvedValue([products, 2]);

      const query: QueryProductDto = {
        page: 1,
        limit: 10,
        orderBy: ProductOrderBy.NOMBRE,
        order: SortOrder.ASC,
      };

      const result = await service.buscarTodos(query, USER_ID);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('product');
      expect(queryBuilder.where).toHaveBeenCalledWith('product.userId = :userId', {
        userId: USER_ID,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('product.activo = :activo', {
        activo: true,
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('product.nombre', SortOrder.ASC);
      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: products,
        total: 2,
        page: 1,
        lastPage: 1,
      });
    });

    it('debería aplicar ILIKE en nombre y descripcion al usar search', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.buscarTodos({ search: 'cola' }, USER_ID);

      // El andWhere de search debe haberse llamado con el patron %cola%.
      const searchCall = queryBuilder.andWhere.mock.calls.find(
        ([clause]) => typeof clause === 'string' && clause.includes('ILIKE'),
      );
      expect(searchCall).toBeDefined();
      expect(searchCall?.[1]).toEqual({ search: '%cola%' });
    });

    it('debería calcular lastPage correctamente con resultados parciales', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 25]);

      const result = await service.buscarTodos({ page: 1, limit: 10 }, USER_ID);

      expect(result.lastPage).toBe(3); // 25 productos / 10 por pagina = 3 paginas
      expect(result.total).toBe(25);
    });
  });

  describe('buscarPorEan13', () => {
    it('debería buscar producto por EAN-13', async () => {
      const product = buildProduct();
      repository.findOne.mockResolvedValue(product);

      const result = await service.buscarPorEan13('7501031311309', USER_ID);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { ean13: '7501031311309', userId: USER_ID },
      });
      expect(result).toEqual(product);
    });

    it('debería retornar null al buscar EAN-13 inexistente', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.buscarPorEan13('0000000000000', USER_ID);

      expect(result).toBeNull();
    });
  });

  describe('buscarPorId', () => {
    it('debería retornar el producto si pertenece al usuario y está activo', async () => {
      const product = buildProduct();
      repository.findOne.mockResolvedValue(product);

      const result = await service.buscarPorId(PRODUCT_ID, USER_ID);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, userId: USER_ID, activo: true },
      });
      expect(result).toEqual(product);
    });

    it('debería lanzar NotFoundException si el producto no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.buscarPorId(PRODUCT_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('debería lanzar NotFoundException si el producto pertenece a otro usuario', async () => {
      // El filtro WHERE incluye userId, asi que el repo ya retorna null.
      // Esto comprueba que el service no expone existencia de productos ajenos.
      repository.findOne.mockResolvedValue(null);

      await expect(service.buscarPorId(PRODUCT_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // Verificamos que el WHERE incluyo el OTHER_USER_ID.
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, userId: OTHER_USER_ID, activo: true },
      });
    });
  });

  describe('actualizar', () => {
    it('debería actualizar un producto existente', async () => {
      const product = buildProduct();
      repository.findOne.mockResolvedValueOnce(product);
      repository.save.mockResolvedValue({ ...product, nombre: 'Coca Cola Nueva' });

      const result = await service.actualizar(PRODUCT_ID, { nombre: 'Coca Cola Nueva' }, USER_ID);

      expect(result.nombre).toBe('Coca Cola Nueva');
      expect(repository.save).toHaveBeenCalled();
    });

    it('debería rechazar actualización si el nuevo EAN-13 ya existe en otro producto del usuario', async () => {
      const product = buildProduct({ ean13: '7501031311309' });
      const conflicto = buildProduct({ id: 'otro-id', ean13: '5901234123457' });
      // Primer findOne: trae el producto a actualizar.
      // Segundo findOne: detecta conflicto con otro producto que ya tiene el nuevo EAN.
      repository.findOne.mockResolvedValueOnce(product).mockResolvedValueOnce(conflicto);

      await expect(
        service.actualizar(PRODUCT_ID, { ean13: '5901234123457' }, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el producto no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.actualizar(PRODUCT_ID, { nombre: 'X' }, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('debería reactivar un producto desactivado al recibir activo: true', async () => {
      const desactivado = buildProduct({ activo: false });
      repository.findOne.mockResolvedValueOnce(desactivado);
      repository.save.mockImplementation((entity) => Promise.resolve(entity as Product));

      const result = await service.actualizar(PRODUCT_ID, { activo: true }, USER_ID);

      // Al pasar activo: true, el WHERE debe NO incluir activo: true (incluye inactivos).
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, userId: USER_ID },
      });
      expect(result.activo).toBe(true);
      expect(repository.save).toHaveBeenCalled();
    });

    it('debería seguir filtrando por activo cuando el dto NO trae activo', async () => {
      const product = buildProduct();
      repository.findOne.mockResolvedValueOnce(product);
      repository.save.mockImplementation((entity) => Promise.resolve(entity as Product));

      await service.actualizar(PRODUCT_ID, { nombre: 'Editado' }, USER_ID);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID, userId: USER_ID, activo: true },
      });
    });
  });

  describe('desactivar', () => {
    it('debería desactivar (soft delete) un producto', async () => {
      const product = buildProduct({ activo: true });
      repository.findOne.mockResolvedValue(product);
      repository.save.mockImplementation((entity) => Promise.resolve(entity as Product));

      const result = await service.desactivar(PRODUCT_ID, USER_ID);

      expect(product.activo).toBe(false);
      expect(repository.save).toHaveBeenCalledWith(product);
      expect(result).toEqual({ message: `Producto ${PRODUCT_ID} desactivado` });
    });

    it('debería lanzar NotFoundException si el producto no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.desactivar(PRODUCT_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
