import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AgentMemoryService } from './memory/agent-memory.service';
import {
  AgentChatInput,
  AgentChatResponse,
  AgentIntent,
} from './types/agent.types';

type PackageContextItem = {
  code: string;
  name: string;
  description: string;
  includes: string[];
  excludes: string[];
  adultPriceMXN: number;
  childPriceMXN: number;
  infantPriceMXN: number;
  extras: Array<{
    code: string;
    name: string;
    priceMXN: number;
  }>;
};

type CampaignContextItem = {
  code: string;
  name: string;
  description: string;
};

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
      ...this.extractMemoryFromMessage(message),
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

    const dataContext = await this.buildStructuredContext();
    const memory = this.memoryService.get(input.sessionId);

    const quickReply = this.getQuickReply({
      message,
      intent,
      packages: dataContext.packages,
      campaigns: dataContext.campaigns,
      sessionId: input.sessionId,
    });

    if (quickReply) {
      return {
        intent,
        handoffRequired: false,
        reply: quickReply,
      };
    }

    const businessContext = this.buildBusinessContextText(dataContext);
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

  private getQuickReply(params: {
    message: string;
    intent: AgentIntent;
    packages: PackageContextItem[];
    campaigns: CampaignContextItem[];
    sessionId: string;
  }): string | null {
    const text = this.normalizeText(params.message);

    if (params.intent === 'GREETING') {
      return this.replyGreeting();
    }

    if (this.isPackageListRequest(text)) {
      return this.replyPackageList(params.packages);
    }

    const detectedPackageCode = this.detectPackageCode(text);

    if (detectedPackageCode && this.isPackageDetailRequest(text)) {
      this.memoryService.update(params.sessionId, {
        packageCode: detectedPackageCode,
        lastIntent: 'PACKAGE_INFO',
      });

      return this.replyPackageDetail(params.packages, detectedPackageCode);
    }

    if (detectedPackageCode && this.isPriceRequest(text)) {
      this.memoryService.update(params.sessionId, {
        packageCode: detectedPackageCode,
        lastIntent: 'QUOTE_REQUEST',
      });

      return this.replyPackagePrices(params.packages, detectedPackageCode);
    }

    if (this.isPriceRequest(text)) {
      const memory = this.memoryService.get(params.sessionId);

      if (memory?.packageCode) {
        return this.replyPackagePrices(params.packages, memory.packageCode);
      }

      return this.replyAllPrices(params.packages);
    }

    if (params.intent === 'CAMPAIGN_INFO') {
      return this.replyCampaigns(params.campaigns);
    }

    if (this.isThanks(text)) {
      return 'Con gusto. Estoy para ayudarte con paquetes, precios o una cotización. ¿Te gustaría reservar o revisar otro paquete?';
    }

    return null;
  }

  private replyGreeting(): string {
    return `¡Hola! Bienvenido a Ki’ichpam.

Puedo ayudarte con:
* Paquetes disponibles
* Precios
* Qué incluye cada paquete
* Cotización para tu visita

¿Te gustaría conocer los paquetes o prefieres que te cotice directo?`;
  }

  private replyPackageList(packages: PackageContextItem[]): string {
    if (!packages.length) {
      return 'Por el momento no tengo paquetes activos disponibles. Te canalizo con un asesor para apoyarte mejor.';
    }

    const lines = packages
      .map((pkg) => {
        return `* ${pkg.name}: ${pkg.description}`;
      })
      .join('\n');

    return `Tenemos estas opciones disponibles:

${lines}

¿Cuál te gustaría conocer a detalle?`;
  }

  private replyPackageDetail(
    packages: PackageContextItem[],
    packageCode: string,
  ): string {
    const pkg = this.findPackage(packages, packageCode);

    if (!pkg) {
      return this.replyPackageList(packages);
    }

    const includes = pkg.includes.length
      ? pkg.includes.map((item) => `* ${item}`).join('\n')
      : '* No especificado';

    const excludes = pkg.excludes.length
      ? pkg.excludes.map((item) => `* ${item}`).join('\n')
      : '* No especificado';

    return `Claro, el paquete ${pkg.name} incluye:

${includes}

No incluye:
${excludes}

Precio:
* Adulto: ${this.moneyFromCents(pkg.adultPriceMXN)}
* Niño: ${this.moneyFromCents(pkg.childPriceMXN)}
* Infante: ${this.moneyFromCents(pkg.infantPriceMXN)}

¿Te gustaría que te haga una cotización para una fecha y número de personas?`;
  }

  private replyPackagePrices(
    packages: PackageContextItem[],
    packageCode: string,
  ): string {
    const pkg = this.findPackage(packages, packageCode);

    if (!pkg) {
      return this.replyAllPrices(packages);
    }

    return `Los precios del paquete ${pkg.name} son:

* Adulto: ${this.moneyFromCents(pkg.adultPriceMXN)}
* Niño: ${this.moneyFromCents(pkg.childPriceMXN)}
* Infante: ${this.moneyFromCents(pkg.infantPriceMXN)}

Niños: 5 a 11 años.
Infantes: 0 a 4 años.

¿Para qué fecha y cuántas personas te gustaría cotizar?`;
  }

  private replyAllPrices(packages: PackageContextItem[]): string {
    if (!packages.length) {
      return 'Por el momento no tengo precios activos disponibles. Te canalizo con un asesor para apoyarte mejor.';
    }

    const lines = packages
      .map((pkg) => {
        return `${pkg.name}
* Adulto: ${this.moneyFromCents(pkg.adultPriceMXN)}
* Niño: ${this.moneyFromCents(pkg.childPriceMXN)}
* Infante: ${this.moneyFromCents(pkg.infantPriceMXN)}`;
      })
      .join('\n\n');

    return `Claro, estos son nuestros precios:

${lines}

Niños: 5 a 11 años.
Infantes: 0 a 4 años.

¿Te gustaría que te cotice algún paquete para una fecha específica?`;
  }

  private replyCampaigns(campaigns: CampaignContextItem[]): string {
    if (!campaigns.length) {
      return 'Por el momento no tengo promociones activas registradas. ¿Te gustaría conocer nuestros paquetes disponibles?';
    }

    const lines = campaigns
      .map((campaign) => {
        return `* ${campaign.name}: ${campaign.description}`;
      })
      .join('\n');

    return `Tenemos estas promociones activas:

${lines}

¿Te gustaría que te ayude a cotizar con alguna promoción?`;
  }

  private async buildStructuredContext(): Promise<{
    packages: PackageContextItem[];
    campaigns: CampaignContextItem[];
  }> {
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

    return {
      packages: packages.map((pkg) => {
        const translation =
          pkg.translations.find((item) => item.lang === 'es') ??
          pkg.translations[0];

        return {
          code: pkg.code,
          name: translation?.name ?? pkg.code,
          description: translation?.description ?? 'Sin descripción disponible',
          includes: this.toStringArray(translation?.includes),
          excludes: this.toStringArray(translation?.excludes),
          adultPriceMXN: Number(pkg.adultPriceMXN ?? 0),
          childPriceMXN: Number(pkg.childPriceMXN ?? 0),
          infantPriceMXN: Number(pkg.infantPriceMXN ?? 0),
          extras: pkg.extras.map((extra) => {
            const extraTranslation =
              extra.translations.find((item) => item.lang === 'es') ??
              extra.translations[0];

            return {
              code: extra.code,
              name: extraTranslation?.name ?? extra.code,
              priceMXN: Number(extra.priceMXN ?? 0),
            };
          }),
        };
      }),
      campaigns: campaigns.map((campaign) => {
        const translation =
          campaign.translations.find((item) => item.lang === 'es') ??
          campaign.translations[0];

        return {
          code: campaign.code,
          name: translation?.promoName ?? campaign.name,
          description:
            translation?.promoDescription ??
            campaign.description ??
            'Sin descripción disponible',
        };
      }),
    };
  }

  private buildBusinessContextText(dataContext: {
    packages: PackageContextItem[];
    campaigns: CampaignContextItem[];
  }): string {
    const packageContext = dataContext.packages.length
      ? dataContext.packages
          .map((pkg, index) => {
            const extras = pkg.extras.length
              ? pkg.extras
                  .map(
                    (extra) =>
                      `- ${extra.name}: ${this.moneyFromCents(extra.priceMXN)}`,
                  )
                  .join('\n')
              : 'Sin extras activos';

            return `
Paquete ${index + 1}:
Nombre: ${pkg.name}
Código: ${pkg.code}
Precio adulto: ${this.moneyFromCents(pkg.adultPriceMXN)}
Precio niño: ${this.moneyFromCents(pkg.childPriceMXN)}
Precio infante: ${this.moneyFromCents(pkg.infantPriceMXN)}
Descripción: ${pkg.description}
Incluye: ${pkg.includes.join(', ') || 'No especificado'}
No incluye: ${pkg.excludes.join(', ') || 'No especificado'}
Extras activos:
${extras}
`;
          })
          .join('\n')
      : 'No hay paquetes activos registrados.';

    const campaignContext = dataContext.campaigns.length
      ? dataContext.campaigns
          .map((campaign, index) => {
            return `
Campaña ${index + 1}:
Nombre: ${campaign.name}
Descripción: ${campaign.description}
Código interno: ${campaign.code}
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
        'tour',
        'tours',
        'info',
        'informacion',
        'incluye',
        'recomiendas',
        'recomendacion',
        'opciones',
        'detalle',
        'detalles',
        'basico',
        'basic',
        'plus',
        'total',
        'todo incluido',
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
        'costo',
        'costos',
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

  private extractMemoryFromMessage(
    message: string,
  ): Partial<{
    packageCode: string;
    adults: number;
    children: number;
    infants: number;
    visitDate: string;
  }> {
    const text = this.normalizeText(message);
    const data: Partial<{
      packageCode: string;
      adults: number;
      children: number;
      infants: number;
      visitDate: string;
    }> = {};

    const packageCode = this.detectPackageCode(text);

    if (packageCode) {
      data.packageCode = packageCode;
    }

    const adults = this.extractNumberBeforeWords(text, [
      'adulto',
      'adultos',
      'persona',
      'personas',
    ]);

    if (adults !== null) {
      data.adults = adults;
    }

    const children = this.extractNumberBeforeWords(text, [
      'nino',
      'ninos',
      'niño',
      'niños',
      'menor',
      'menores',
    ]);

    if (children !== null) {
      data.children = children;
    }

    const infants = this.extractNumberBeforeWords(text, [
      'infante',
      'infantes',
      'bebe',
      'bebes',
      'bebé',
      'bebés',
    ]);

    if (infants !== null) {
      data.infants = infants;
    }

    const date = this.extractDateLikeText(message);

    if (date) {
      data.visitDate = date;
    }

    return data;
  }

  private extractNumberBeforeWords(
    text: string,
    words: string[],
  ): number | null {
    for (const word of words) {
      const normalizedWord = this.normalizeText(word);
      const regex = new RegExp(`(\\d+)\\s+${normalizedWord}`, 'i');
      const match = text.match(regex);

      if (match?.[1]) {
        const value = Number(match[1]);

        if (Number.isFinite(value)) {
          return value;
        }
      }
    }

    return null;
  }

  private extractDateLikeText(message: string): string | null {
    const text = message.trim();

    const dateMatch = text.match(
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
    );

    if (dateMatch?.[1]) {
      return dateMatch[1];
    }

    const lower = this.normalizeText(text);

    if (lower.includes('manana')) {
      return 'mañana';
    }

    if (lower.includes('hoy')) {
      return 'hoy';
    }

    const monthWords = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];

    for (const month of monthWords) {
      const regex = new RegExp(`\\b\\d{1,2}\\s+de\\s+${month}\\b`, 'i');

      if (regex.test(lower)) {
        return message;
      }
    }

    return null;
  }

  private detectPackageCode(text: string): string | null {
    const normalized = this.normalizeText(text);

    if (
      this.includesAny(normalized, [
        'basico',
        'basic',
        'kx basico',
        'kx basic',
        'sencillo',
        'entrada basica',
      ])
    ) {
      return 'KX_BASIC';
    }

    if (
      this.includesAny(normalized, [
        'plus',
        'kx plus',
        'con comida',
        'con alimentos',
        'buffet',
      ])
    ) {
      return 'KX_PLUS';
    }

    if (
      this.includesAny(normalized, [
        'total',
        'kx total',
        'todo incluido',
        'todo incluído',
        'completo',
        'dos cenotes',
      ])
    ) {
      return 'KX_TOTAL';
    }

    return null;
  }

  private isPackageListRequest(text: string): boolean {
    return this.includesAny(text, [
      'paquetes',
      'tours',
      'opciones',
      'que ofrecen',
      'que tienen',
      'informacion',
      'info',
    ]);
  }

  private isPackageDetailRequest(text: string): boolean {
    return this.includesAny(text, [
      'detalle',
      'detalles',
      'incluye',
      'incluyen',
      'que trae',
      'que contiene',
      'informacion',
      'info',
      'dime de',
      'conocer',
    ]);
  }

  private isPriceRequest(text: string): boolean {
    return this.includesAny(text, [
      'precio',
      'precios',
      'cuesta',
      'costo',
      'costos',
      'cuanto',
      'cuanto cuesta',
      'cotizar',
      'cotizacion',
      'total',
    ]);
  }

  private isThanks(text: string): boolean {
    return this.includesAny(text, ['gracias', 'muchas gracias', 'ok gracias']);
  }

  private findPackage(
    packages: PackageContextItem[],
    packageCode: string,
  ): PackageContextItem | null {
    return packages.find((pkg) => pkg.code === packageCode) ?? null;
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0);
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item).trim())
            .filter((item) => item.length > 0);
        }
      } catch {
        return value
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
    }

    return [];
  }

  private moneyFromCents(value: unknown): string {
    const cents = Number(value);

    if (!Number.isFinite(cents)) {
      return 'No disponible';
    }

    const amount = cents / 100;

    return `$${amount.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} MXN`;
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