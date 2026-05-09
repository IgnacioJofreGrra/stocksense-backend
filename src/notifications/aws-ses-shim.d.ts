/**
 * Shim de tipos para @aws-sdk/client-ses.
 *
 * Por que: el SDK se importa dinamicamente solo en produccion (cuando
 * AWS_SES_REGION + AWS_SES_FROM_EMAIL estan configurados). En desarrollo
 * y en CI no esta instalado para no inflar node_modules. TypeScript exige
 * tipos para el modulo aunque el import sea dinamico, asi que declaramos
 * los minimos que usa NotificationsService.
 *
 * Cuando se instale el paquete real, este shim queda redundante; el
 * compilador prefiere los tipos del package real (los .d.ts del paquete
 * tienen prioridad sobre las declaraciones ambient del proyecto).
 */
declare module '@aws-sdk/client-ses' {
  export class SESClient {
    constructor(config: { region: string });
    send(command: unknown): Promise<unknown>;
  }
  export class SendEmailCommand {
    constructor(input: {
      Source: string;
      Destination: { ToAddresses: string[] };
      Message: {
        Subject: { Data: string; Charset?: string };
        Body: {
          Html?: { Data: string; Charset?: string };
          Text?: { Data: string; Charset?: string };
        };
      };
    });
  }
}
