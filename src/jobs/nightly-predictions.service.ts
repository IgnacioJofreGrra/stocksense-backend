import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AlertaEmail, ProductoUrgente } from '../notifications/notifications.types';
import { UsersService } from '../users/users.service';

/**
 * Pausa entre usuarios. Groq free tier tiene rate limits; aunque estamos
 * iterando con un dueno por iteracion, cada predecirReposicion puede
 * disparar varios calls internos. Mejor ser conservadores.
 */
const DELAY_ENTRE_USUARIOS_MS = 1000;

/**
 * Resumen del run para que el operador vea el outcome de un vistazo.
 */
export interface ResumenJobNocturno {
  duenosProcesados: number;
  duenosConAlertas: number;
  emailsEnviados: number;
  errores: number;
  duracionMs: number;
}

/**
 * NightlyPredictionsService.
 *
 * Recorre los duenos activos y para cada uno:
 * 1. Ejecuta predecirReposicion (calienta el cache de IA con TTL 30 min).
 * 2. Filtra productos con urgencia 'alta'.
 * 3. Si hay urgentes, despacha email via NotificationsService.
 *
 * Decisiones:
 * - El service NO bootstrappea NestJS — es injectable. El orchestrator
 *   (el script standalone o la Lambda) crea la app y resuelve este service.
 *   Asi se puede testear con TestingModule sin hacer lifecycle real.
 * - Si Groq falla para un dueno, se loguea y se sigue con los demas.
 *   Un comercio con datos invalidos no debe romper el resto del run.
 * - Delay con setTimeout es interrumpible si el process recibe SIGTERM
 *   (la Lambda lo aprecia).
 */
@Injectable()
export class NightlyPredictionsService {
  private readonly logger = new Logger(NightlyPredictionsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly aiService: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<ResumenJobNocturno> {
    const inicio = Date.now();
    const duenos = await this.usersService.findActiveDuenos();
    this.logger.log(`Iniciando job nocturno para ${duenos.length} dueno(s) activo(s)`);

    let duenosConAlertas = 0;
    let emailsEnviados = 0;
    let errores = 0;

    for (let i = 0; i < duenos.length; i++) {
      const dueno = duenos[i];
      try {
        const predicciones = await this.aiService.predecirReposicion(dueno.id);
        const productosUrgentes: ProductoUrgente[] = predicciones
          .filter((p) => p.urgencia === 'alta')
          .map((p) => ({
            nombre: p.nombre,
            ean13: p.ean13,
            stockActual: p.stockActual,
            diasHastaAgotamiento: p.diasHastaAgotamiento,
            cantidadSugeridaReponer: p.cantidadSugeridaReponer,
          }));

        if (productosUrgentes.length === 0) {
          this.logger.debug(`Sin alertas para ${dueno.email}`);
        } else {
          duenosConAlertas++;
          const alerta: AlertaEmail = {
            userId: dueno.id,
            email: dueno.email,
            comercioNombre: dueno.comercioNombre,
            productosUrgentes,
          };

          await this.notifications.enviarAlertaStock(alerta);
          emailsEnviados++;
          this.logger.log(
            `Alerta procesada: ${dueno.email} (${productosUrgentes.length} producto(s) urgente(s))`,
          );
        }
      } catch (err) {
        errores++;
        const message = err instanceof Error ? err.message : 'error desconocido';
        this.logger.error(`Fallo procesando dueno ${dueno.email}: ${message}`);
        // Seguimos con el siguiente dueno — un fallo aislado no debe
        // tumbar al resto del run.
      }

      // Pausa entre usuarios para no abusar del rate limit de Groq.
      // Siempre se aplica al final de la iteracion (incluso si no hubo
      // alertas, predecirReposicion ya consumio su slot del rate limit).
      // No aplica al ultimo dueno: gana ~1s en cada run.
      if (i < duenos.length - 1) {
        await this.delay(DELAY_ENTRE_USUARIOS_MS);
      }
    }

    const resumen: ResumenJobNocturno = {
      duenosProcesados: duenos.length,
      duenosConAlertas,
      emailsEnviados,
      errores,
      duracionMs: Date.now() - inicio,
    };
    this.logger.log(
      `Job finalizado: procesados=${resumen.duenosProcesados} alertas=${resumen.duenosConAlertas} emails=${resumen.emailsEnviados} errores=${resumen.errores} duracion=${resumen.duracionMs}ms`,
    );
    return resumen;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
