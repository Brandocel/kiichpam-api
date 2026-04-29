import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateCustomerReply(params: {
    customerMessage: string;
    businessContext: string;
    conversationMemory?: string;
  }): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn('Missing GEMINI_API_KEY. Using safe fallback response.');
      return this.getFallbackReply();
    }

    const prompt = this.buildPrompt({
      customerMessage: params.customerMessage,
      businessContext: this.normalizeBusinessContext(params.businessContext),
      conversationMemory: this.normalizeConversationMemory(
        params.conversationMemory,
      ),
    });

    try {
      const response = await axios.post<GeminiGenerateContentResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.75,
            topK: 40,
            maxOutputTokens: 550,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!text) {
        return this.getFallbackReply();
      }

      // 🔥 AQUI ESTA EL FIX FINAL
      return this.fixPricesInReply(this.cleanReply(text));
    } catch (error) {
      const axiosError = error as AxiosError<any>;

      this.logger.error(
        'Error calling Gemini',
        JSON.stringify(axiosError.response?.data || axiosError.message, null, 2),
      );

      return this.getFallbackReply();
    }
  }

  private buildPrompt(params: {
    customerMessage: string;
    businessContext: string;
    conversationMemory: string;
  }): string {
    return `
Eres el asistente de ventas de Ki’ichpam.

- Responde en español
- Usa SOLO el contexto real
- Mantén continuidad con la memoria
- Precios vienen en centavos (14900 = $149.00 MXN)
- NO inventes datos
- Respuesta estilo WhatsApp

Contexto:
${params.businessContext}

Memoria:
${params.conversationMemory}

Cliente:
"${params.customerMessage}"

Respuesta:
`;
  }

  // 🔥 CONVERSIÓN CORRECTA DESDE API
  private moneyFromCents(value: unknown): string {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return 'No disponible';
    }

    const amount = numberValue / 100;

    return `$${amount.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} MXN`;
  }

  private normalizeBusinessContext(context: string): string {
    if (!context) return 'Sin contexto';

    try {
      const parsed = JSON.parse(context);
      const packages = parsed?.data || parsed;

      return packages
        .map((pkg: any) => {
          return `
Paquete: ${pkg.translation?.name}
Adulto: ${this.moneyFromCents(pkg.adultPriceMXN)}
Niño: ${this.moneyFromCents(pkg.childPriceMXN)}
Infante: ${this.moneyFromCents(pkg.infantPriceMXN)}
`;
        })
        .join('\n');
    } catch {
      return context;
    }
  }

  private normalizeConversationMemory(memory?: string): string {
    if (!memory) return 'Sin memoria previa';

    return `
${memory}

Usa esto como continuidad del chat.
`;
  }

  private cleanReply(reply: string): string {
    return reply
      .replace(/\*\*/g, '')
      .replace(/```/g, '')
      .replace(/^Respuesta:\s*/i, '')
      .trim();
  }

  // 🔥🔥🔥 ESTE ES EL HEROE 🔥🔥🔥
  private fixPricesInReply(reply: string): string {
    return reply
      // $64,600 → $646.00
      .replace(/\$(\d{1,3}(?:,\d{3})+|\d{4,})\s*MXN/gi, (_match, raw) => {
        const cents = Number(String(raw).replace(/,/g, ''));
        return this.moneyFromCents(cents);
      })

      // 64600 MXN → $646.00
      .replace(/(:\s*)(\d{4,})\s*MXN/gi, (_match, prefix, raw) => {
        return `${prefix}${this.moneyFromCents(raw)}`;
      });
  }

  private getFallbackReply(): string {
    return 'Gracias por escribirnos. ¿Qué paquete te interesa?';
  }
}