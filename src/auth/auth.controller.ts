import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SafeUser, TokenResponse } from './dto/token-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';

/**
 * Endpoints de autenticacion.
 *
 * @HttpCode override:
 * - register devuelve 201 (default de @Post): creo recurso.
 * - login/refresh/logout devuelven 200: no crean recurso, solo emiten tokens
 *   o invalidan estado.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario y emitir tokens' })
  @ApiResponse({ status: 201, description: 'Usuario creado con tokens emitidos' })
  @ApiResponse({ status: 400, description: 'Validacion fallida (email/password/nombres)' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  register(@Body() dto: RegisterDto): Promise<TokenResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email y password' })
  @ApiResponse({ status: 200, description: 'Tokens emitidos' })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
  login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar tokens (rota el refresh token)' })
  @ApiResponse({ status: 200, description: 'Nuevos tokens emitidos' })
  @ApiResponse({ status: 401, description: 'Refresh token invalido o revocado' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Cerrar sesion (invalida el refresh token en BD)' })
  @ApiResponse({ status: 200, description: 'Sesion cerrada' })
  @ApiResponse({ status: 401, description: 'Sin token o token invalido' })
  async logout(@CurrentUser() user: User): Promise<{ message: string }> {
    await this.authService.logout(user.id);
    return { message: 'Sesion cerrada' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Usuario actual' })
  @ApiResponse({ status: 401, description: 'Sin token o token invalido' })
  profile(@CurrentUser() user: User): SafeUser {
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

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Editar datos del perfil (nombre, comercioNombre)' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  @ApiResponse({ status: 400, description: 'Validacion fallida' })
  @ApiResponse({ status: 401, description: 'Sin token o token invalido' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto): Promise<SafeUser> {
    return this.authService.updateProfile(user.id, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Cambiar contrasena (verifica la actual e invalida sesiones)',
  })
  @ApiResponse({ status: 200, description: 'Contrasena actualizada' })
  @ApiResponse({ status: 400, description: 'Validacion fallida (longitud minima)' })
  @ApiResponse({ status: 401, description: 'Contrasena actual incorrecta o sin token' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { message: 'Contrasena actualizada' };
  }
}
