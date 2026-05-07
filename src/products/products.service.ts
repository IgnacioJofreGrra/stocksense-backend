import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductOrderBy, QueryProductDto, SortOrder } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

export interface PaginatedProducts {
  data: Product[];
  total: number;
  page: number;
  lastPage: number;
}

/**
 * ProductsService.
 *
 * Multi-tenancy simple: cada metodo recibe userId y filtra por el. Asi un
 * usuario solo ve/modifica sus propios productos. Sin este filtro tendriamos
 * IDOR (Insecure Direct Object Reference): cualquiera con token podria leer
 * productos ajenos cambiando el :id de la URL.
 */
@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  /**
   * Crea un producto. Falla con 409 si el (ean13, userId) ya existe.
   *
   * El check pre-insert da un mensaje legible al cliente. El @Unique de la
   * entidad sigue siendo la red de seguridad contra race conditions: si dos
   * requests llegan a la vez, uno gana y el otro recibe error de constraint.
   */
  async crear(dto: CreateProductDto, userId: string): Promise<Product> {
    const existente = await this.productsRepository.findOne({
      where: { ean13: dto.ean13, userId },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe un producto con EAN-13 ${dto.ean13} para este usuario`,
      );
    }
    const product = this.productsRepository.create({ ...dto, userId });
    return this.productsRepository.save(product);
  }

  /**
   * Lista productos paginados del usuario, con busqueda y filtros opcionales.
   *
   * Por que QueryBuilder y no findAndCount: necesitamos ILIKE sobre dos
   * columnas con OR (nombre o descripcion). El sintaxis de find() lo
   * expresaria con `[{ nombre: ILike(...) }, { descripcion: ILike(...) }]`,
   * pero al combinarlo con otros filtros (userId, activo, categoria) la
   * estructura se complica. QueryBuilder es mas explicito.
   */
  async buscarTodos(query: QueryProductDto, userId: string): Promise<PaginatedProducts> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const orderBy = query.orderBy ?? ProductOrderBy.CREATED_AT;
    const order = query.order ?? SortOrder.ASC;
    // activo es boolean con default true. Comparamos con `=== false` para
    // distinguir "no enviado" (undefined -> default true) de "false explicito".
    const activo = query.activo === false ? false : true;

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .where('product.userId = :userId', { userId })
      .andWhere('product.activo = :activo', { activo });

    if (query.categoria) {
      qb.andWhere('product.categoria = :categoria', { categoria: query.categoria });
    }

    if (query.search) {
      qb.andWhere('(product.nombre ILIKE :search OR product.descripcion ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy(`product.${orderBy}`, order)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      lastPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Busca un producto por UUID. Solo retorna si pertenece al user.
   *
   * Por que filtramos por userId aqui (y no solo confiamos en buscarTodos):
   * GET /products/:id es un endpoint directo. Si el atacante conoce el UUID
   * de un producto ajeno, sin este filtro tendria acceso. El filtro convierte
   * "no es tuyo" en 404 (en lugar de 403) para no filtrar la existencia
   * del recurso (defensa en profundidad).
   *
   * Tambien filtramos por activo por defecto: productos desactivados son
   * invisibles. opciones.incluirInactivos = true los incluye, util para el
   * modulo de inventario (ajustes correctivos sobre productos retirados).
   */
  async buscarPorId(
    id: string,
    userId: string,
    opciones: { incluirInactivos?: boolean } = {},
  ): Promise<Product> {
    const where: { id: string; userId: string; activo?: boolean } = { id, userId };
    if (!opciones.incluirInactivos) {
      where.activo = true;
    }
    const product = await this.productsRepository.findOne({ where });
    if (!product) {
      throw new NotFoundException(`Producto ${id} no encontrado`);
    }
    return product;
  }

  /**
   * Busca un producto por EAN-13 dentro del catalogo del usuario.
   *
   * Retorna null si no existe (no lanza). Este endpoint lo usa el escaner
   * del frontend: scaneo el codigo, consulto si ya tengo el producto.
   * Si no existe -> UI ofrece "Crear nuevo". Si lanzaramos 404, la consola
   * del browser se llenaria de errores en flujo normal.
   *
   * No filtramos por activo: el escaner debe encontrar tambien los productos
   * desactivados (asi el dueño puede reactivarlos en lugar de duplicar).
   */
  async buscarPorEan13(ean13: string, userId: string): Promise<Product | null> {
    return this.productsRepository.findOne({
      where: { ean13, userId },
    });
  }

  /**
   * Actualiza un producto. Si cambia el EAN-13, valida que el nuevo no
   * choque con otro producto del mismo user.
   *
   * Reactivacion: si el dto trae `activo: true`, traemos el producto
   * incluyendo los desactivados — sino buscarPorId filtraria por activo=true
   * y un producto soft-deleted nunca podria reactivarse (NotFoundException).
   */
  async actualizar(id: string, dto: UpdateProductDto, userId: string): Promise<Product> {
    const incluirInactivos = dto.activo === true;
    const product = await this.buscarPorId(id, userId, { incluirInactivos });

    if (dto.ean13 && dto.ean13 !== product.ean13) {
      const conflicto = await this.productsRepository.findOne({
        where: { ean13: dto.ean13, userId },
      });
      if (conflicto) {
        throw new ConflictException(
          `Ya existe otro producto con EAN-13 ${dto.ean13} para este usuario`,
        );
      }
    }

    Object.assign(product, dto);
    return this.productsRepository.save(product);
  }

  // Soft delete: marca activo=false. No borra el registro porque los
  // StockMovement lo referencian y no queremos romper el historial.
  async desactivar(id: string, userId: string): Promise<{ message: string }> {
    const product = await this.buscarPorId(id, userId);
    product.activo = false;
    await this.productsRepository.save(product);
    return { message: `Producto ${id} desactivado` };
  }
}
