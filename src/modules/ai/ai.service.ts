import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateReply(userMessage: string): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `
Eres un asistente de atención al cliente para una empresa turística llamada Ki’ichpam.

Reglas:
- Responde en español
- Sé amable, claro y profesional
- Ayuda con paquetes, precios y reservas
- No inventes precios si no los sabes
- Mantén respuestas cortas y útiles

Mensaje del cliente:
"${userMessage}"
                  `,
                },
              ],
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      return text || 'Lo siento, no pude generar una respuesta.';
    } catch (error: any) {
      this.logger.error(
        'Error calling Gemini',
        error.response?.data || error.message,
      );

      return 'Ocurrió un error al procesar tu mensaje.';
    }
  }
}