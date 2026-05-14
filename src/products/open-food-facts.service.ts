import { Injectable, Logger } from '@nestjs/common';

interface OFFProductResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    categories?: string;
    image_front_url?: string;
  };
}

export interface OFFSugerencia {
  nombre: string | null;
  marca: string | null;
  categoria: string | null;
  imagenUrl: string | null;
}

@Injectable()
export class OpenFoodFactsService {
  private readonly logger = new Logger(OpenFoodFactsService.name);

  async buscarPorEAN(ean: string): Promise<OFFSugerencia | null> {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`, {
        headers: { 'User-Agent': 'StockSense/1.0 (contacto@tuapp.com)' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as OFFProductResponse;
      if (data.status !== 1 || !data.product) return null;

      const p = data.product;
      return {
        nombre: p.product_name ?? null,
        marca: p.brands ?? null,
        categoria: p.categories ?? null,
        imagenUrl: p.image_front_url ?? null,
      };
    } catch (error) {
      // OFF caído no debe tirar 500 en la app
      this.logger.warn(`OpenFoodFacts falló para EAN ${ean}: ${String(error)}`);
      return null;
    }
  }
}
