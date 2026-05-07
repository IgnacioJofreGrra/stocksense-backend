import { IsJWT, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  /**
   * @IsJWT valida que el string tenga estructura `header.payload.signature`.
   * No verifica firma (eso lo hace JwtService.verify). Solo descarta inputs
   * que ni siquiera parecen JWTs.
   */
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
