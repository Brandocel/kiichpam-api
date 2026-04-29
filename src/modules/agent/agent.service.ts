import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  ) {}

  async chat(input: AgentChatInput): Promise<AgentChatResponse> {
    const lang = input.lang ?? 'es';
    const message = input.message.trim();

    const intent = this.detectIntent(message);

    this.memoryService.update(input.sessionId, {
      lastIntent: intent,
      lastMessage: message,
    });

    this.logger.log(
      `Agent message | channel=${input.channel} session=${input.sessionId} intent=${intent}`,
    );

    switch (intent) {
      case 'GREETING':
        return {
          intent,
          handoffRequired: false,
          reply:
            lang === 'en'
              ? 'Hello! Welcome to Ki’ichpam. I can help you with packages, promotions, prices, and reservations.'
              : '¡Hola! Bienvenido a Ki’ichpam. Puedo ayudarte con paquetes, promociones, precios y reservas. ¿Qué te gustaría conocer?',
        };

      case 'PACKAGE_INFO':
        return this.getPackagesReply(lang, intent);

      case 'CAMPAIGN_INFO':
        return this.getCampaignsReply(lang, intent);

      case 'QUOTE_REQUEST':
        return {
          intent,
          handoffRequired: false,
          reply:
            'Con gusto te ayudo a cotizar. Para darte un precio correcto, dime por favor: fecha de visita, cuántos adultos, niños e infantes asistirán.',
        };

      case 'RESERVATION_REQUEST':
        return {
          intent,
          handoffRequired: false,
          reply:
            'Perfecto, te ayudo con tu reserva. Para comenzar necesito: paquete, fecha de visita, número de adultos, niños e infantes.',
        };

      case 'HUMAN_HANDOFF':
        return {
          intent,
          handoffRequired: true,
          reply:
            'Claro, te voy a canalizar con una persona del equipo para ayudarte mejor. Por favor espera un momento.',
        };

      default:
        return {
          intent,
          handoffRequired: false,
          reply:
            'Puedo ayudarte con información de paquetes, promociones, precios o reservas. Puedes escribirme por ejemplo: “paquetes”, “promociones” o “quiero reservar”.',
        };
    }
  }

  private detectIntent(message: string): AgentIntent {
    const text = message.toLowerCase();

    if (
      this.includesAny(text, [
        'hola',
        'buenas',
        'buen día',
        'buen dia',
        'buenas tardes',
        'hello',
        'hi',
      ])
    ) {
      return 'GREETING';
    }

    if (
      this.includesAny(text, [
        'paquete',
        'paquetes',
        'tour',
        'tours',
        'info',
        'información',
        'informacion',
        'incluye',
      ])
    ) {
      return 'PACKAGE_INFO';
    }

    if (
      this.includesAny(text, [
        'promo',
        'promoción',
        'promocion',
        'descuento',
        'campaña',
        'campana',
        'oferta',
      ])
    ) {
      return 'CAMPAIGN_INFO';
    }

    if (
      this.includesAny(text, [
        'precio',
        'cuesta',
        'cotizar',
        'cotización',
        'cotizacion',
        'cuánto',
        'cuanto',
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
      ])
    ) {
      return 'RESERVATION_REQUEST';
    }

    if (
      this.includesAny(text, [
        'humano',
        'persona',
        'asesor',
        'alguien',
        'queja',
        'reembolso',
        'cancelar',
        'cancelación',
        'cancelacion',
        'problema',
      ])
    ) {
      return 'HUMAN_HANDOFF';
    }

    return 'UNKNOWN';
  }

  private includesAny(text: string, words: string[]): boolean {
    return words.some((word) => text.includes(word));
  }

  private async getPackagesReply(
    lang: 'es' | 'en',
    intent: AgentIntent,
  ): Promise<AgentChatResponse> {
    const packages = await this.prisma.package.findMany({
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
    });

    if (!packages.length) {
      return {
        intent,
        handoffRequired: false,
        reply:
          'Por el momento no tengo paquetes activos disponibles. Puedo canalizarte con un asesor para ayudarte.',
      };
    }

    const lines = packages.map((pkg, index) => {
      const translation =
        pkg.translations.find((item) => item.lang === lang) ??
        pkg.translations.find((item) => item.lang === 'es') ??
        pkg.translations[0];

      const name = translation?.name ?? pkg.code;

      return `${index + 1}. ${name}
Adulto: $${pkg.adultPriceMXN} MXN
Niño: $${pkg.childPriceMXN} MXN
Infante: $${pkg.infantPriceMXN} MXN`;
    });

    return {
      intent,
      handoffRequired: false,
      reply: `Estos son nuestros paquetes disponibles:\n\n${lines.join(
        '\n\n',
      )}\n\n¿Te gustaría que te ayude a cotizar o reservar alguno?`,
    };
  }

  private async getCampaignsReply(
    lang: 'es' | 'en',
    intent: AgentIntent,
  ): Promise<AgentChatResponse> {
    const now = new Date();

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE',
        OR: [
          {
            startAt: null,
          },
          {
            startAt: {
              lte: now,
            },
          },
        ],
        AND: [
          {
            OR: [
              {
                endAt: null,
              },
              {
                endAt: {
                  gte: now,
                },
              },
            ],
          },
        ],
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
    });

    if (!campaigns.length) {
      return {
        intent,
        handoffRequired: false,
        reply:
          'Por ahora no tengo promociones activas registradas. Si quieres, puedo ayudarte a revisar los paquetes disponibles.',
      };
    }

    const lines = campaigns.map((campaign, index) => {
      const translation =
        campaign.translations.find((item) => item.lang === lang) ??
        campaign.translations.find((item) => item.lang === 'es') ??
        campaign.translations[0];

      const promoName = translation?.promoName ?? campaign.name;
      const promoDescription =
        translation?.promoDescription ?? campaign.description ?? '';

      return `${index + 1}. ${promoName}${
        promoDescription ? `\n${promoDescription}` : ''
      }`;
    });

    return {
      intent,
      handoffRequired: false,
      reply: `Estas son las promociones activas:\n\n${lines.join(
        '\n\n',
      )}\n\nPuedo ayudarte a cotizar con la promoción disponible.`,
    };
  }
}