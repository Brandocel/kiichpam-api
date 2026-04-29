import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AgentMemoryService } from './memory/agent-memory.service';
import {
  AgentChatInput,
  AgentChatResponse,
  AgentIntent,
} from './types/agent.types';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: AgentMemoryService,
    private readonly aiService: AiService,
  ) {}

  async chat(input: AgentChatInput): Promise<AgentChatResponse> {
    const message = input.message.trim();
    const intent = this.detectIntent(message);

    this.memoryService.update(input.sessionId, {
      lastIntent: intent,
      lastMessage: message,
    });

    this.logger.log(
      `Agent message | channel=${input.channel} session=${input.sessionId} intent=${intent}`,
    );

    if (this.mustHandoff(message)) {
      return {
        intent: 'HUMAN_HANDOFF',
        handoffRequired: true,
        reply:
          'Claro, te canalizo con una persona del equipo para apoyarte mejor. Por favor espera un momento.',
      };
    }

    const businessContext = await this.buildBusinessContext();
    const conversationMemory = this.buildConversationMemory(input.sessionId);

    const reply = await this.aiService.generateCustomerReply({
      customerMessage: message,
      businessContext,
      conversationMemory,
    });

    return {
      intent,
      handoffRequired: false,
      reply,
    };
  }

  private detectIntent(message: string): AgentIntent {
    const text = this.normalizeText(message);

    if (
      this.includesAny(text, [
        'hola',
        'buenas',
        'buen dia',
        'buenas tardes',
        'hello',
        'hi',
        'que tal',
      ])
    ) {
      return 'GREETING';
    }

    if (
      this.includesAny(text, [
        'paquete',
        'paquetes',
        'paqute',
        'paqutes',
        'paqueteria',
        'tour',
        'tours',
        'info',
        'informacion',
        'incluye',
        'recomiendas',
        'recomiendas',
        'recomendacion',
        'opciones',
      ])
    ) {
      return 'PACKAGE_INFO';
    }

    if (
      this.includesAny(text, [
        'promo',
        'promocion',
        'promociones',
        'descuento',
        'campana',
        'campaña',
        'oferta',
        '2x1',
      ])
    ) {
      return 'CAMPAIGN_INFO';
    }

    if (
      this.includesAny(text, [
        'precio',
        'precios',
        'cuesta',
        'cotizar',
        'cotizacion',
        'cuanto',
        'cuanto cuesta',
        'total',
      ])
    ) {
      return 'QUOTE_REQUEST';
    }

    if (
      this.includesAny(text, [
        'reservar',
        'reserva',
        'apartar',
        'quiero ir',
        'agendar',
        'mañana',
        'manana',
        'adultos',
        'ninos',
        'niños',
        'infantes',
      ])
    ) {
      return 'RESERVATION_REQUEST';
    }

    if (this.mustHandoff(text)) {
      return 'HUMAN_HANDOFF';
    }

    return 'UNKNOWN';
  }

  private async buildBusinessContext(): Promise<string> {
    const [packages, campaigns] = await Promise.all([
      this.prisma.package.findMany({
        where: {
          isActive: true,
        },
        include: {
          translations: true,
          extras: {
            where: {
              isActive: true,
            },
            include: {
              translations: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 10,
      }),
      this.prisma.campaign.findMany({
        where: {
          isActive: true,
          status: 'ACTIVE',
        },
        include: {
          translations: true,
          package: {
            include: {
              translations: true,
            },
          },
        },
        orderBy: [
          {
            priority: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        take: 10,
      }),
    ]);

    const packageContext = packages.length
      ? packages
          .map((pkg, index) => {
            const translation =
              pkg.translations.find((item) => item.lang === 'es') ??
              pkg.translations[0];

            const extras = pkg.extras
              .map((extra) => {
                const extraTranslation =
                  extra.translations.find((item) => item.lang === 'es') ??
                  extra.translations[0];

                return `- ${extraTranslation?.name ?? extra.code}: Precio $${extra.priceMXN} MXN`;
              })
              .join('\n');

            return `
Paquete ${index + 1}:
Nombre: ${translation?.name ?? pkg.code}
Código: ${pkg.code}
Precio adulto: $${pkg.adultPriceMXN} MXN
Precio niño: $${pkg.childPriceMXN} MXN
Precio infante: $${pkg.infantPriceMXN} MXN
Descripción: ${translation?.description ?? 'Sin descripción disponible'}
Incluye: ${translation?.includes ?? 'No especificado'}
No incluye: ${translation?.excludes ?? 'No especificado'}
Extras activos:
${extras || 'Sin extras activos'}
`;
          })
          .join('\n')
      : 'No hay paquetes activos registrados.';

    const campaignContext = campaigns.length
      ? campaigns
          .map((campaign, index) => {
            const translation =
              campaign.translations.find((item) => item.lang === 'es') ??
              campaign.translations[0];

            return `
Campaña ${index + 1}:
Nombre: ${translation?.promoName ?? campaign.name}
Descripción: ${translation?.promoDescription ?? campaign.description ?? 'Sin descripción'}
Código interno: ${campaign.code}
Estado: ${campaign.status}
`;
          })
          .join('\n')
      : 'No hay campañas activas registradas.';

    return `
PAQUETES ACTIVOS:
${packageContext}

CAMPAÑAS ACTIVAS:
${campaignContext}

POLÍTICAS BASE:
- Para cotizar correctamente pide fecha de visita, paquete, adultos, niños e infantes.
- No confirmar una reserva como creada si no se ejecutó el endpoint de reservas.
- Si el cliente pregunta por disponibilidad exacta, pedir fecha y canalizar validación.
- Si el cliente pide pago, reembolso, cancelación o cambio especial, canalizar con asesor humano.
`;
  }

  private buildConversationMemory(sessionId: string): string {
    const memory = this.memoryService.get(sessionId);

    if (!memory) {
      return 'Sin memoria previa.';
    }

    return `
Última intención: ${memory.lastIntent ?? 'N/A'}
Último mensaje: ${memory.lastMessage ?? 'N/A'}
Paquete detectado: ${memory.packageCode ?? 'N/A'}
Fecha detectada: ${memory.visitDate ?? 'N/A'}
Adultos: ${memory.adults ?? 'N/A'}
Niños: ${memory.children ?? 'N/A'}
Infantes: ${memory.infants ?? 'N/A'}
`;
  }

  private mustHandoff(message: string): boolean {
    const text = this.normalizeText(message);

    return this.includesAny(text, [
      'humano',
      'persona',
      'asesor',
      'ejecutivo',
      'alguien',
      'queja',
      'reembolso',
      'devolucion',
      'cancelar',
      'cancelacion',
      'problema de pago',
      'pago fallido',
      'molesto',
      'demanda',
    ]);
  }

  private includesAny(text: string, words: string[]): boolean {
    return words.some((word) => text.includes(this.normalizeText(word)));
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}