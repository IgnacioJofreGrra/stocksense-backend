import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { PaginatedProducts, ProductsService } from './products.service';

/**
 * ProductsController.
 *
 * Guards a nivel clase: JwtAuthGuard valida token, RolesGuard chequea @Roles.
 * Sin @Roles en un handler, RolesGuard pasa siempre -> cualquier user
 * autenticado accede. Con @Roles(UserRole.DUENO) solo dueño accede.
 *
 * Politica de acceso:
 * - Lectura (GET): cualquier user autenticado (dueño o empleado).
 * - Escritura (POST/PATCH/DELETE): solo dueño. El empleado vende; el
 *   dueño administra el catalogo.
 *
 * Orden de rutas: /products/ean/:ean13 ANTES de /products/:id. NestJS
 * matchea arriba abajo; si invertimos, "ean" se interpretaria como UUID
 * y ParseUUIDPipe rechazaria con 400.
 */
@ApiTags('products')
@ApiBearerAuth('JWT')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.DUENO)
  @ApiOperation({ summary: 'Crear producto (solo dueño)' })
  @ApiResponse({ status: 201, description: 'Producto creado' })
  @ApiResponse({ status: 400, description: 'EAN-13 invalido o validacion fallida' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (no dueño)' })
  @ApiResponse({ status: 409, description: 'EAN-13 duplicado para este usuario' })
  crear(@Body() dto: CreateProductDto, @CurrentUser() user: User): Promise<Product> {
    return this.productsService.crear(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar productos paginados con filtros' })
  buscarTodos(
    @Query() query: QueryProductDto,
    @CurrentUser() user: User,
  ): Promise<PaginatedProducts> {
    return this.productsService.buscarTodos(query, user.id);
  }

  @Get('ean/:ean13')
  @ApiOperation({
    summary: 'Buscar producto por EAN-13 (flujo del escaner)',
    description: 'Retorna null si no existe. NO filtra por activo.',
  })
  buscarPorEan13(
    @Param('ean13') ean13: string,
    @CurrentUser() user: User,
  ): Promise<Product | null> {
    return this.productsService.buscarPorEan13(ean13, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de producto por UUID' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado o desactivado' })
  buscarPorId(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): Promise<Product> {
    return this.productsService.buscarPorId(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.DUENO)
  @ApiOperation({ summary: 'Actualizar producto (solo dueño)' })
  @ApiResponse({ status: 200, description: 'Producto actualizado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (no dueño)' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 409, description: 'Nuevo EAN-13 ya existe para este usuario' })
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: User,
  ): Promise<Product> {
    return this.productsService.actualizar(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.DUENO)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete: desactiva el producto (solo dueño)' })
  @ApiResponse({ status: 200, description: 'Producto desactivado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (no dueño)' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  desactivar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    return this.productsService.desactivar(id, user.id);
  }
}
