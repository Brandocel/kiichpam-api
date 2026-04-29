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

      return this.cleanReply(text);
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
Eres el asistente de atención al cliente y ventas de Ki’ichpam.

Tu objetivo:
- Atender de forma humana, amable, elegante, breve y clara.
- Ayudar a vender paquetes.
- Recuperar el contexto anterior de la conversación.
- Guiar al cliente hacia una cotización o reserva.
- Resolver dudas usando SOLO la información real disponible.

REGLAS ESTRICTAS:
1. Responde siempre en español.
2. No inventes precios, promociones, horarios, disponibilidad ni políticas.
3. Usa únicamente los precios, paquetes e información del CONTEXTO REAL.
4. Si el cliente ya dio datos antes, NO se los vuelvas a pedir.
5. Usa la MEMORIA DE CONVERSACIÓN para entender a qué paquete, fecha o cantidad de personas se refiere.
6. Si el mensaje actual es ambiguo, intenta resolverlo con la memoria previa.
7. Si falta información para cotizar, pide solo los datos faltantes.
8. Si ya hay paquete, adultos, niños, infantes y fecha, puedes hacer una cotización clara.
9. Los precios del sistema pueden venir en centavos. Ejemplo: 14900 significa $149.00 MXN.
10. No muestres IDs internos, códigos técnicos, JSON, errores, endpoints ni tokens.
11. No digas “según el contexto”.
12. No uses tablas.
13. Mantén respuestas listas para WhatsApp, con saltos de línea útiles.
14. Si hay cancelación, reembolso, queja, problema de pago o caso delicado, canaliza con asesor humano.
15. Cierra siempre con una pregunta útil para avanzar la venta.

FORMATO DE RESPUESTA:
- Saludo corto si aplica.
- Respuesta directa.
- Si cotizas, muestra:
  Paquete:
  Fecha:
  Adultos:
  Niños:
  Infantes:
  Total:
- Cierre con pregunta para avanzar.

CONTEXTO REAL DISPONIBLE:
${params.businessContext}

MEMORIA DE CONVERSACIÓN:
${params.conversationMemory}

MENSAJE ACTUAL DEL CLIENTE:
"${params.customerMessage}"

RESPUESTA FINAL PARA WHATSAPP:
`;
  }

  private normalizeBusinessContext(context: string): string {
    if (!context || !context.trim()) {
      return 'No hay contexto real disponible.';
    }

    try {
      const parsed = JSON.parse(context);

      const packages = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];

      if (!packages.length) {
        return context;
      }

      return packages
        .map((pkg: any) => {
          const effective = pkg.effectivePackage || pkg;
          const translation = pkg.translation || effective.translation || {};

          const name =
            effective.name ||
            translation.name ||
            pkg.name ||
            pkg.code ||
            'Paquete sin nombre';

          const description =
            effective.description ||
            translation.description ||
            pkg.description ||
            'Sin descripción disponible';

          const adultPrice = this.moneyFromCents(
            effective.adultPriceMXN ?? pkg.adultPriceMXN,
          );

          const childPrice = this.moneyFromCents(
            effective.childPriceMXN ?? pkg.childPriceMXN,
          );

          const infantPrice = this.moneyFromCents(
            effective.infantPriceMXN ?? pkg.infantPriceMXN,
          );

          const includes = this.listToText(
            effective.includes || translation.includes || pkg.includes,
          );

          const excludes = this.listToText(
            effective.excludes || translation.excludes || pkg.excludes,
          );

          const notes = this.listToText(
            effective.notes || translation.notes || pkg.notes,
          );

          return `
Paquete: ${name}
Código: ${pkg.code || effective.code || 'N/A'}
Descripción: ${description}
Precio adulto: ${adultPrice}
Precio niño: ${childPrice}
Precio infante: ${infantPrice}
Edades:
- Adulto: ${pkg.ageRules?.adultMin ?? 12}+ años
- Niño: ${pkg.ageRules?.childMin ?? 5}-${pkg.ageRules?.childMax ?? 11} años
- Infante: 0-${pkg.ageRules?.infantMax ?? 4} años
Incluye: ${includes}
No incluye: ${excludes}
Notas: ${notes}
`;
        })
        .join('\n-------------------------\n');
    } catch {
      return this.convertMoneyLikeValuesInText(context);
    }
  }

  private normalizeConversationMemory(memory?: string): string {
    if (!memory || !memory.trim()) {
      return `
Sin memoria previa.

Instrucción:
Si el cliente menciona "ese paquete", "el mismo", "para esa fecha", "cuánto sería", "y con niños", o algo similar, intenta recuperar los datos desde mensajes anteriores si existen.
`;
    }

    return `
${memory}

Resumen de uso:
- Usa esta memoria como continuidad del chat.
- Mantén el último paquete mencionado como paquete activo.
- Mantén la última fecha mencionada como fecha activa.
- Mantén la última cantidad de adultos, niños e infantes como datos activos.
- Si el cliente cambia un dato, actualiza solo ese dato y conserva los demás.
`;
  }

  private moneyFromCents(value: unknown): string {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return 'No disponible';
    }

    const amount = numberValue / 100;

    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  private listToText(value: unknown): string {
    if (Array.isArray(value)) {
      if (!value.length) return 'No especificado';
      return value.join(', ');
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return 'No especificado';
  }

  private convertMoneyLikeValuesInText(text: string): string {
    return text.replace(
      /"(adultPriceMXN|childPriceMXN|infantPriceMXN)"\s*:\s*(\d+)/g,
      (_match, key, value) => {
        return `"${key}": "${this.moneyFromCents(value)}"`;
      },
    );
  }

  private cleanReply(reply: string): string {
    return reply
      .replace(/\*\*/g, '')
      .replace(/```/g, '')
      .replace(/^Respuesta:\s*/i, '')
      .replace(/^RESPUESTA FINAL PARA WHATSAPP:\s*/i, '')
      .trim();
  }

  private getFallbackReply(): string {
    return 'Gracias por escribirnos. En este momento estoy teniendo alta demanda para generar una respuesta detallada. Puedo ayudarte con paquetes, precios o reservas. ¿Qué te gustaría consultar?';
  }
}