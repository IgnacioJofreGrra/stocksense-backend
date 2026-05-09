/**
 * Tipos publicos de AiService — los devuelven los endpoints REST y los
 * resolvers GraphQL. Documentan el contrato con el frontend.
 */

export type Urgencia = 'alta' | 'media' | 'baja';
export type Prioridad = 'urgente' | 'normal' | 'opcional';

export interface PrediccionRestock {
  productoId: string;
  nombre: string;
  ean13: string;
  stockActual: number;
  consumoPromedioDiario: number;
  diasHastaAgotamiento: number;
  cantidadSugeridaReponer: number;
  urgencia: Urgencia;
  razonamiento: string;
}

export interface PatronDiario {
  dia: string;
  insight: string;
  relevancia: 'alta' | 'media' | 'baja';
}

export interface PatronHorario {
  franja: string;
  insight: string;
}

export interface ProductoDestacado {
  nombre: string;
  patron: string;
}

export interface AnalisisTendencias {
  patronesDiarios: PatronDiario[];
  patronesHorarios: PatronHorario[];
  productosDestacados: ProductoDestacado[];
  recomendaciones: string[];
  resumenGeneral: string;
}

export interface ItemOrden {
  productoId: string;
  nombre: string;
  ean13: string;
  cantidadSugerida: number;
  precioUnitarioEstimado: number | null;
  subtotalEstimado: number | null;
  prioridad: Prioridad;
  motivo: string;
}

export interface OrdenCompra {
  items: ItemOrden[];
  totalEstimado: number | null;
  notas: string;
  fechaSugerida: string;
}
