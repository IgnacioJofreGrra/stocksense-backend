import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * AuthModule.
 *
 * - PassportModule: requerido por @nestjs/passport para registrar strategies.
 * - JwtModule.register({}): registramos vacio porque firmamos cada token
 *   con secret/expiresIn explicitos (leidos de ConfigService) en runtime.
 *   Asi el modulo no acopla a la config del registro estatico.
 * - UsersModule: importado para que JwtStrategy y AuthService puedan
 *   inyectar UsersService (declarado como export en UsersModule).
 * - JwtStrategy en providers: el simple acto de incluirla la registra con
 *   Passport y la ata al guard 'jwt'.
 */
@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
