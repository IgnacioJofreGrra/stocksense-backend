import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { InventoryService } from '../../inventory/inventory.service';
import { Product } from '../../products/entities/product.entity';
import { ProductsService } from '../../products/products.service';
import { User, UserRole } from '../../users/entities/user.entity';
import { CreateProductInput } from '../inputs/create-product.input';
import { QueryProductsInput } from '../inputs/query-products.input';
import { UpdateProductInput } from '../inputs/update-product.input';
import { PaginatedProducts } from '../types/paginated.types';
import { OpenFoodFactsService } from '../../products/open-food-facts.service';
import { ResultadoEscaner } from '../types/resultado-escaner.type';

/**
 * ProductsResolver.
 *
 * Resolvers thin: delegan toda la logica a ProductsService (los mismos
 * services que usan los controllers REST). Cero duplicacion.
 *
 * Guards: JwtAuthGuard + RolesGuard a nivel clase. Las queries pasan con
 * cualquier user autenticado; las mutations usan @Roles(UserRole.DUENO)
 * para restringir a dueño.
 *
 * Campo calculado: stockActual via @ResolveField — solo se ejecuta si el
 * cliente lo pide en la query. Imposible en REST sin endpoints especificos.
 */
@Resolver(() => Product)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsResolver {
  constructor(
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
    private readonly openFoodFactsService: OpenFoodFactsService,
  ) {}

  // ===== QUERIES =====

  @Query(() => PaginatedProducts, { name: 'productos' })
  productos(
    @Args('query', { type: () => QueryProductsInput, nullable: true })
    query: QueryProductsInput | undefined,
    @CurrentUser() user: User,
  ): Promise<PaginatedProducts> {
    return this.productsService.buscarTodos(query ?? {}, user.id);
  }

  @Query(() => Product, { name: 'producto', nullable: true })
  producto(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<Product> {
    return this.productsService.buscarPorId(id, user.id);
  }

  @Query(() => ResultadoEscaner, { name: 'productoPorEan' })
  async productoPorEan(
    @Args('ean13') ean13: string,
    @CurrentUser() user: User,
  ): Promise<ResultadoEscaner> {
    const local = await this.productsService.buscarPorEan13(ean13, user.id);
    if (local) {
      return { fuente: 'local', producto: local, sugerenciaOff: null };
    }

    const sugerencia = await this.openFoodFactsService.buscarPorEAN(ean13);
    if (sugerencia) {
      return { fuente: 'off', producto: null, sugerenciaOff: sugerencia };
    }

    return { fuente: 'desconocido', producto: null, sugerenciaOff: null };
  }

  // ===== MUTATIONS =====

  @Mutation(() => Product, { name: 'crearProducto' })
  @Roles(UserRole.DUENO)
  crearProducto(
    @Args('input') input: CreateProductInput,
    @CurrentUser() user: User,
  ): Promise<Product> {
    return this.productsService.crear(input, user.id);
  }

  @Mutation(() => Product, { name: 'actualizarProducto' })
  @Roles(UserRole.DUENO)
  actualizarProducto(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProductInput,
    @CurrentUser() user: User,
  ): Promise<Product> {
    return this.productsService.actualizar(id, input, user.id);
  }

  @Mutation(() => Boolean, { name: 'desactivarProducto' })
  @Roles(UserRole.DUENO)
  async desactivarProducto(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    await this.productsService.desactivar(id, user.id);
    return true;
  }

  // ===== CAMPO CALCULADO =====

  /**
   * stockActual no esta en la entidad — se calcula desde stock_movements.
   * GraphQL lo resuelve solo si el cliente lo pide en la query:
   *   query { productos { id, nombre, stockActual } }  -> 1 query agregada por producto
   *   query { productos { id, nombre } }              -> sin queries extra
   *
   * Esto es la magia de @ResolveField: el motor de GraphQL invoca este
   * metodo solo cuando el campo aparece en el AST de la query.
   */
  @ResolveField(() => Int)
  async stockActual(@Parent() product: Product): Promise<number> {
    const snapshot = await this.inventoryService.calcularStock(product.id, product.userId);
    return snapshot.stockActual;
  }
}
