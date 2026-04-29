import { AgentIntent } from '../types/agent.types';

export type PackageCode = 'KX_BASIC' | 'KX_PLUS' | 'KX_TOTAL';

export type IntentDictionaryResult = {
  intent: AgentIntent;
  score: number;
  packageCode?: PackageCode;
  matchedWords: string[];
};

export const PACKAGE_DICTIONARY: Record<PackageCode, string[]> = {
  KX_BASIC: [
    'basico',
    'básico',
    'basic',
    'vasico',
    'vásico',
    'barato',
    'sencillo',
    'entrada sencilla',
    'entrada basica',
    'entrada básica',
    'solo cenote',
    'yun chen',
  ],

  KX_PLUS: [
    'plus',
    'pluz',
    'con comida',
    'con alimentos',
    'alimentos',
    'buffet',
    'bufet',
    'comida',
    'incluye comida',
  ],

  KX_TOTAL: [
    'total',
    'totall',
    'todo incluido',
    'todo incluído',
    'completo',
    'full',
    'dos cenotes',
    '2 cenotes',
    'bicicleta',
    'segundo cenote',
  ],
};

export const INTENT_DICTIONARY: Record<AgentIntent, string[]> = {
  GREETING: [
    'hola',
    'ola',
    'buenas',
    'buen dia',
    'buen día',
    'buenas tardes',
    'buenas noches',
    'hello',
    'hi',
    'que tal',
    'qué tal',
  ],

  PACKAGE_INFO: [
    'paquete',
    'paquetes',
    'paqute',
    'paqutes',
    'tour',
    'tours',
    'opciones',
    'que ofrecen',
    'qué ofrecen',
    'que tienen',
    'informacion',
    'información',
    'info',
    'detalle',
    'detalles',
    'incluye',
    'incluyen',
    'que trae',
    'qué trae',
    'que contiene',
    'recomiendas',
    'recomendacion',
    'recomendación',
  ],

  QUOTE_REQUEST: [
    'precio',
    'precios',
    'cuesta',
    'costo',
    'costos',
    'cuanto',
    'cuánto',
    'cuanto cuesta',
    'cuánto cuesta',
    'cotizar',
    'cotizacion',
    'cotización',
    'total',
    'sale',
    'cuanto sale',
    'cuánto sale',
  ],

  RESERVATION_REQUEST: [
    'reservar',
    'reserva',
    'apartar',
    'agendar',
    'quiero ir',
    'quiero reservar',
    'fecha',
    'dia',
    'día',
    'mañana',
    'manana',
    'adultos',
    'niños',
    'ninos',
    'infantes',
    'personas',
  ],

  CAMPAIGN_INFO: [
    'promo',
    'promocion',
    'promoción',
    'promociones',
    'descuento',
    'oferta',
    '2x1',
    'campaña',
    'campana',
  ],

  HUMAN_HANDOFF: [
    'humano',
    'persona',
    'asesor',
    'ejecutivo',
    'alguien',
    'queja',
    'reembolso',
    'devolucion',
    'devolución',
    'cancelar',
    'cancelacion',
    'cancelación',
    'problema de pago',
    'pago fallido',
    'molesto',
    'demanda',
  ],

  UNKNOWN: [],
};