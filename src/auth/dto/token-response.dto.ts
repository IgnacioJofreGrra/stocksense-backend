import { UserRole } from '../../users/entities/user.entity';

/**
 * Forma del usuario que devolvemos en respuestas (sin password ni
 * refreshToken). Tipo derivado en lugar de DTO con decoradores porque
 * solo se usa para tipar la salida; class-validator no lo necesita.
 */
export interface SafeUser {
  id: string;
  email: string;
  nombre: string;
  rol: UserRole;
  comercioNombre: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenResponse {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}
