import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

/**
 * Token DI para inyectar el cliente Groq.
 *
 * Por que un token (no la clase Groq directamente):
 * - En tests, override con un mock: { provide: GROQ_CLIENT, useValue: fakeGroq }.
 * - Si manana cambiamos a otro provider de LLM (Anthropic, OpenAI),
 *   solo cambia el factory, no los services.
 */
export const GROQ_CLIENT = 'GROQ_CLIENT';

/**
 * Tipo del cliente — el real o null si no hay API key.
 *
 * Devolvemos null en lugar de throw porque queremos que la app arranque
 * en development sin la key (los demas modulos tienen que poder testearse
 * y correr). El AiService chequea y responde ServiceUnavailable cuando
 * efectivamente intenta usar la IA.
 */
export type GroqClient = Groq | null;

/**
 * GroqProvider — factory que construye el cliente Groq desde ConfigService.
 *
 * - Si GROQ_API_KEY esta vacio: log warning + devolvemos null. La app
 *   levanta igual; AiService falla en runtime con error claro.
 * - Si esta presente: instanciamos Groq SDK. La SDK no hace request al
 *   crearse, solo guarda la key — si la key es invalida nos enteramos
 *   en la primera llamada (manejado en AiService con HTTP 401 -> 503).
 */
export const GroqProvider: Provider = {
  provide: GROQ_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): GroqClient => {
    const apiKey = configService.get<string>('groq.apiKey', '');
    if (!apiKey) {
      Logger.warn(
        'GROQ_API_KEY no configurada — el modulo IA respondera 503 en runtime. ' +
          'Para habilitarlo, agregar GROQ_API_KEY al .env.local.',
        'GroqProvider',
      );
      return null;
    }
    return new Groq({ apiKey });
  },
};
