import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from '../../inventory/inventory.service';
import { Product } from '../../products/entities/product.entity';
import { ProductsService } from '../../products/products.service';
import { User, UserRole } from '../../users/entities/user.entity';
import { ProductsResolver } from './products.resolver';

/**
 * Tests unitarios del ProductsResolver.
 *
 * Mockeamos ProductsService e InventoryService. Verificamos que:
 * - Las queries y mutations delegan al service correcto.
 * - El campo calculado stockActual llama a InventoryService.calcularStock.
 * - El userId se propaga desde el User del contexto.
 *
 * Los guards (JwtAuthGuard, RolesGuard) NO se ejecutan aqui porque NestJS
 * solo los corre cuando el resolver se invoca via el ejecutor real de
 * GraphQL/HTTP. Los guards los testeamos en sus propios spec files.
 */
describe('ProductsResolver', () => {
  let resolver: ProductsResolver;
  let productsService: jest.Mocked<ProductsService>;
  let inventoryService: jest.Mocked<InventoryService>;

  const USER: User = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'test@x.com',
    password: '',
    nombre: 'Test',
    rol: UserRole.DUENO,
    comercioNombre: 'Almacen Test',
    activo: true,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const PRODUCT: Product = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    ean13: '7501031311309',
    nombre: 'Coca Cola',
    descripcion: null,
    categoria: null,
    precioCompra: null,
    precioVenta: null,
    unidadMedida: 'unidad',
    stockMinimo: 5,
    imagenUrl: null,
    activo: true,
    userId: USER.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsResolver,
        {
          provide: ProductsService,
          useValue: {
            buscarTodos: jest.fn(),
            buscarPorId: jest.fn(),
            buscarPorEan13: jest.fn(),
            crear: jest.fn(),
            actualizar: jest.fn(),
            desactivar: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            calcularStock: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get(ProductsResolver);
    productsService = module.get(ProductsService);
    inventoryService = module.get(InventoryService);
  });

  it('productos: delega a ProductsService.buscarTodos con userId del contexto', async () => {
    productsService.buscarTodos.mockResolvedValue({
      data: [PRODUCT],
      total: 1,
      page: 1,
      lastPage: 1,
    });

    const result = await resolver.productos({ page: 1, limit: 10 }, USER);

    expect(productsService.buscarTodos).toHaveBeenCalledWith({ page: 1, limit: 10 }, USER.id);
    expect(result.total).toBe(1);
  });

  it('productos: pasa {} cuando query es undefined', async () => {
    productsService.buscarTodos.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });

    await resolver.productos(undefined, USER);

    expect(productsService.buscarTodos).toHaveBeenCalledWith({}, USER.id);
  });

  it('producto: busca por id', async () => {
    productsService.buscarPorId.mockResolvedValue(PRODUCT);
    const result = await resolver.producto(PRODUCT.id, USER);
    expect(productsService.buscarPorId).toHaveBeenCalledWith(PRODUCT.id, USER.id);
    expect(result).toEqual(PRODUCT);
  });

  it('crearProducto: delega con userId del contexto', async () => {
    productsService.crear.mockResolvedValue(PRODUCT);
    const input = { ean13: '7501031311309', nombre: 'Coca Cola' };
    await resolver.crearProducto(input, USER);
    expect(productsService.crear).toHaveBeenCalledWith(input, USER.id);
  });

  it('desactivarProducto: retorna true tras soft delete', async () => {
    productsService.desactivar.mockResolvedValue({ message: 'ok' });
    const result = await resolver.desactivarProducto(PRODUCT.id, USER);
    expect(result).toBe(true);
    expect(productsService.desactivar).toHaveBeenCalledWith(PRODUCT.id, USER.id);
  });

  describe('@ResolveField stockActual', () => {
    it('llama a InventoryService.calcularStock con productId y userId del producto', async () => {
      inventoryService.calcularStock.mockResolvedValue({
        productId: PRODUCT.id,
        stockActual: 42,
        ultimoMovimiento: null,
      });

      const result = await resolver.stockActual(PRODUCT);

      expect(inventoryService.calcularStock).toHaveBeenCalledWith(PRODUCT.id, PRODUCT.userId);
      expect(result).toBe(42);
    });
  });
});
