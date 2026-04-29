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
      this.logger.warn('Missing GEMINI_API_KEY. Using fallback response.');
      return this.getFallbackReply();
    }

    const prompt = this.buildPrompt(params);

    try {
      const response = await axios.post<GeminiGenerateContentResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 450,
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
    conversationMemory?: string;
  }): string {
    return `
Eres el asistente de atención al cliente y ventas de Ki’ichpam.

Tu objetivo:
- Atender de forma humana, elegante, breve y clara.
- Ayudar a vender paquetes.
- Guiar al cliente hacia una cotización o reserva.
- Resolver dudas usando SOLO la información del contexto.

Reglas estrictas:
1. Responde siempre en español.
2. No inventes precios, promociones, horarios, disponibilidad ni políticas.
3. Si el cliente pregunta por precios, usa únicamente los precios del contexto.
4. Si falta información para cotizar, pide los datos faltantes.
5. No pidas datos bancarios.
6. No muestres información técnica, tokens, IDs internos, errores del sistema ni detalles de la API.
7. Si el cliente pide cancelación, reembolso, queja, problema de pago o algo delicado, indica que será canalizado con un asesor humano.
8. Mantén respuestas listas para WhatsApp: cortas, claras y con saltos de línea útiles.
9. No uses markdown pesado. No uses tablas.
10. Cierra con una pregunta útil para avanzar la venta.

Contexto real disponible:
${params.businessContext}

Memoria breve de conversación:
${params.conversationMemory || 'Sin memoria previa.'}

Mensaje del cliente:
"${params.customerMessage}"

Respuesta:
`;
  }

  private cleanReply(reply: string): string {
    return reply
      .replace(/\*\*/g, '')
      .replace(/```/g, '')
      .trim();
  }

  private getFallbackReply(): string {
    return 'Gracias por escribirnos. Puedo ayudarte con paquetes, promociones, precios o reservas. ¿Qué te gustaría consultar?';
  }
}