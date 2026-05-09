import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlertaEmail, ProductoUrgente } from './notifications.types';

/**
 * NotificationsService — envio de emails de alerta.
 *
 * Diseno modular: el servicio es independiente del transporte. Decide al
 * momento de enviar:
 * - Si esta configurado AWS_SES_REGION + AWS_SES_FROM_EMAIL en produccion,
 *   carga el SDK de SES (import dinamico para no agregar peso a desarrollo)
 *   y envia.
 * - Caso contrario, loguea a consola para que el operador lo vea durante
 *   pruebas locales.
 *
 * Renderizar HTML aqui (no en un template engine) mantiene el bundle
 * chico. Si crece la complejidad, migrar a Handlebars/MJML.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Envia un email con los productos urgentes detectados por el job nocturno.
   * No throw: cualquier error queda en log para no romper el procesamiento
   * de otros usuarios.
   */
  async enviarAlertaStock(alerta: AlertaEmail): Promise<void> {
    if (alerta.productosUrgentes.length === 0) {
      return;
    }

    const subject = this.generarAsunto(alerta);
    const html = this.generarHtmlAlerta(alerta);
    const text = this.generarTextoPlano(alerta);

    const sesRegion = this.configService.get<string>('AWS_SES_REGION');
    const fromEmail = this.configService.get<string>('AWS_SES_FROM_EMAIL');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (nodeEnv === 'production' && sesRegion && fromEmail) {
      try {
        await this.enviarConSES({
          region: sesRegion,
          from: fromEmail,
          to: alerta.email,
          subject,
          html,
          text,
        });
        this.logger.log(
          `Email enviado a ${alerta.email} (${alerta.productosUrgentes.length} productos)`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error desconocido';
        this.logger.error(`Fallo envio SES a ${alerta.email}: ${message}`);
      }
      return;
    }

    // Modo desarrollo / staging: log estructurado.
    this.logger.log(
      `[EMAIL DEV] to=${alerta.email} comercio="${alerta.comercioNombre}" productos=${alerta.productosUrgentes.length}`,
    );
    for (const p of alerta.productosUrgentes) {
      this.logger.log(
        `  - ${p.nombre} (EAN ${p.ean13}): stock=${p.stockActual}, agotamiento=${p.diasHastaAgotamiento}d, reponer=${p.cantidadSugeridaReponer}`,
      );
    }
  }

  private generarAsunto(alerta: AlertaEmail): string {
    return `[StockSense] ${alerta.comercioNombre} — ${alerta.productosUrgentes.length} producto(s) por agotarse`;
  }

  /**
   * Texto plano para clientes que no renderizan HTML. Refleja la misma
   * informacion que el HTML, sin estilos.
   */
  private generarTextoPlano(alerta: AlertaEmail): string {
    const lineas = alerta.productosUrgentes.map(
      (p) =>
        `- ${p.nombre} (EAN ${p.ean13})\n  Stock: ${p.stockActual} | Se agota en ~${p.diasHastaAgotamiento} dia(s) | Reponer: ${p.cantidadSugeridaReponer} unidad(es)`,
    );
    return [
      `Hola,`,
      ``,
      `StockSense detecto ${alerta.productosUrgentes.length} producto(s) que necesitan reposicion en ${alerta.comercioNombre}:`,
      ``,
      ...lineas,
      ``,
      `Abri StockSense para generar la orden de compra.`,
      ``,
      `— StockSense`,
    ].join('\n');
  }

  private generarHtmlAlerta(alerta: AlertaEmail): string {
    const filas = alerta.productosUrgentes.map((p) => this.generarFilaProducto(p)).join('\n');

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'https://stocksense.vercel.app';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Alerta de stock</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#dc2626;">⚠ Productos por agotarse</h1>
    <p style="margin:0 0 16px 0;color:#475569;">
      ${this.escapeHtml(alerta.comercioNombre)} — ${alerta.productosUrgentes.length} producto(s) detectado(s) por StockSense.
    </p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Producto</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Stock</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Se agota</th>
          <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Reponer</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>
    <p style="margin:24px 0 0 0;text-align:center;">
      <a href="${this.escapeHtml(frontendUrl)}/inteligencia"
         style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
        Generar orden de compra
      </a>
    </p>
    <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      Este aviso fue generado automaticamente por StockSense.
    </p>
  </div>
</body>
</html>`;
  }

  private generarFilaProducto(p: ProductoUrgente): string {
    return `<tr>
  <td style="padding:8px;border-bottom:1px solid #f1f5f9;">
    <strong>${this.escapeHtml(p.nombre)}</strong><br/>
    <span style="font-size:12px;color:#64748b;">EAN ${this.escapeHtml(p.ean13)}</span>
  </td>
  <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#dc2626;font-weight:600;">${p.stockActual}</td>
  <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;">~${p.diasHastaAgotamiento} d</td>
  <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${p.cantidadSugeridaReponer}</td>
</tr>`;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Envio real con SES. Import dinamico: si el SDK no esta instalado en
   * desarrollo (no hace falta), no rompe el bundle. Solo se ejecuta cuando
   * NODE_ENV === 'production' y las env vars estan presentes.
   *
   * Credenciales: en EC2 con IAM role no hace falta pasarlas. El SDK las
   * toma del metadata service. En otros entornos, AWS_ACCESS_KEY_ID +
   * AWS_SECRET_ACCESS_KEY se leen de env vars automaticamente.
   */
  private async enviarConSES(opciones: {
    region: string;
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    // Import dinamico — ver aws-ses-shim.d.ts para tipos minimos cuando el
    // paquete no esta instalado. En produccion el SDK se instala con
    // `npm install @aws-sdk/client-ses` (ver docs/DEPLOY-AWS.md).
    // Si no esta instalado, el catch devuelve null y se loguea el error.
    const sesModule = await import('@aws-sdk/client-ses').catch(() => null);
    if (!sesModule) {
      throw new Error('AWS SES SDK no instalado. Correr: npm install @aws-sdk/client-ses');
    }
    const client = new sesModule.SESClient({ region: opciones.region });
    const command = new sesModule.SendEmailCommand({
      Source: opciones.from,
      Destination: { ToAddresses: [opciones.to] },
      Message: {
        Subject: { Data: opciones.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: opciones.html, Charset: 'UTF-8' },
          Text: { Data: opciones.text, Charset: 'UTF-8' },
        },
      },
    });

    await client.send(command);
  }
}
