import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

/**
 * UsersModule.
 *
 * - TypeOrmModule.forFeature([User]) -> registra el repositorio de User
 *   en este modulo. Habilita la inyeccion de Repository<User> en el service.
 * - exports: [UsersService] -> sin esto, AuthModule no podria inyectar
 *   UsersService aunque importe UsersModule. NestJS exige declaracion
 *   explicita de lo publico.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
