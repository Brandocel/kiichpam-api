import { Injectable, Logger } from '@nestjs/common';
import {
  AgentMessageDirection,
  AgentMessageSender,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AgentConversationService } from './conversations/agent-conversation.service';
import { IntentClassifierService } from './intents/intent-classifier.service';
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
    private readonly conversationService: AgentConversationService,
    private readonly intentClassifier: IntentClassifierService,
  ) {}

  async chat(input: AgentChatInput): Promise<AgentChatResponse> {
    const message = input.message.trim();

    await this.conversationService.getOrCreate({
      sessionId: input.sessionId,
      channel: input.channel,
    });

    await this.conversationService.addMessage({
      sessionId: input.sessionId,
      sender: AgentMessageSender.CUSTOMER,
      channel: input.channel,
      direction: AgentMessageDirection.INBOUND,
      message,
    });

    const isHumanMode = await this.conversationService.isHumanMode(
      input.sessionId,
    );

    if (isHumanMode) {
      return {
        intent: 'HUMAN_HANDOFF',
        handoffRequired: true,
        reply: '',
      };
    }

    const classification = this.intentClassifier.classify(message);
    const extractedMemory = this.extractMemoryFromMessage(message);

    await this.conversationService.updateContext(input.sessionId, {
      lastIntent: classification.intent,
      lastIntentScore: classification.score,
      lastMessage: message,
      matchedWords: classification.matchedWords,
      packageCode: classification.packageCode ?? extractedMemory.packageCode,
      visitDate: extractedMemory.visitDate,
      adults: extractedMemory.adults,
      children: extractedMemory.children,
      infants: extractedMemory.infants,
    });

    this.memoryService.update(input.sessionId, {
      lastIntent: classification.intent,
      lastIntentScore: classification.score,
      lastMessage: message,
      matchedWords: classification.matchedWords,
      packageCode: classification.packageCode ?? extractedMemory.packageCode,
      visitDate: extractedMemory.visitDate,
      adults: extractedMemory.adults,
      children: extractedMemory.children,
      infants: extractedMemory.infants,
    });

    this.logger.log(
      `Agent message | channel=${input.channel} session=${input.sessionId} intent=${classification.intent} score=${classification.score}`,
    );

    if (classification.intent === 'HUMAN_HANDOFF' || this.mustHandoff(message)) {
      await this.conversationService.takeHumanControl(input.sessionId);

      const reply =
        'Claro, te canalizo con una persona del equipo para apoyarte mejor. Por favor espera un momento.';

      await this.saveBotReply({
        input,
        reply,
        intent: 'HUMAN_HANDOFF',
        intentScore: classification.score,
        packageCode: classification.packageCode,
      });

      return {
        intent: 'HUMAN_HANDOFF',
        handoffRequired: true,
        reply,
      };
    }

    if (classification.shouldAskClarification) {
      const reply = this.replyClarification();

      await this.saveBotReply({
        input,
        reply,
        intent: classification.intent,
        intentScore: classification.score,
        packageCode: classification.packageCode,
      });

      return {
        intent: classification.intent,
        handoffRequired: false,
        reply,
      };
    }

    const dataContext = await this.buildStructuredContext();

    const quickReply = this.getQuickReply({
      message,
      intent: classification.intent,
      packages: dataContext.packages,
      campaigns: dataContext.campaigns,
      sessionId: input.sessionId,
    });

    if (quickReply && classification.score >= 0.8) {
      await this.saveBotReply({
        input,
        reply: quickReply,
        intent: classification.intent,
        intentScore: classification.score,
        packageCode: classification.packageCode,
      });

      return {
        intent: classification.intent,
        handoffRequired: false,
        reply: quickReply,
      };
    }

    const businessContext = this.buildBusinessContextText(dataContext);

    const conversationMemory = await this.conversationService.getMemoryText(
      input.sessionId,
    );

    const reply = await this.aiService.generateCustomerReply({
      customerMessage: message,
      businessContext,
      conversationMemory,
    });

    await this.saveBotReply({
      input,
      reply,
      intent: classification.intent,
      intentScore: classification.score,
      packageCode: classification.packageCode,
    });

    return {
      intent: classification.intent,
      handoffRequired: false,
      reply,
    };
  }

  async takeHumanControl(sessionId: string, agentId?: string) {
    return this.conversationService.takeHumanControl(sessionId, agentId);
  }

  async releaseHumanControl(sessionId: string) {
    return this.conversationService.releaseHumanControl(sessionId);
  }

  private async saveBotReply(params: {
    input: AgentChatInput;
    reply: string;
    intent: AgentIntent;
    intentScore?: number;
    packageCode?: string;
  }) {
    if (!params.reply.trim()) return;

    await this.conversationService.addMessage({
      sessionId: params.input.sessionId,
      sender: AgentMessageSender.BOT,
      channel: params.input.channel,
      direction: AgentMessageDirection.OUTBOUND,
      message: params.reply,
      intent: params.intent,
      intentScore: params.intentScore,
      packageCode: params.packageCode,
    });
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

    if (this.isPackageListRequest(text)) {
      return this.replyPackageList(params.packages);
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

  private replyClarification(): string {
    return `Con gusto te ayudo.

Para orientarte mejor, ¿quieres información sobre paquetes, precios o deseas hacer una cotización?`;
  }

  private replyPackageList(packages: PackageContextItem[]): string {
    if (!packages.length) {
      return 'Por el momento no tengo paquetes activos disponibles. Te canalizo con un asesor para apoyarte mejor.';
    }

    const lines = packages
      .map((pkg) => `* ${pkg.name}: ${pkg.description}`)
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
      .map((campaign) => `* ${campaign.name}: ${campaign.description}`)
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
        'vasico',
        'vásico',
      ])
    ) {
      return 'KX_BASIC';
    }

    if (
      this.includesAny(normalized, [
        'plus',
        'pluz',
        'kx plus',
        'con comida',
        'con alimentos',
        'buffet',
        'bufet',
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
        'full',
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
      .replace(/[¿?¡!.,;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}