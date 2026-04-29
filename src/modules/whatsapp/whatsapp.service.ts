import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { WhatsappWebhookDto } from './dto/whatsapp-webhook.dto';
import {
  ParsedWhatsappMessage,
  WhatsappSendMessageResponse,
} from './interfaces/whatsapp-message.interface';
import { parseWhatsappWebhookMessage } from './utils/whatsapp-message-parser';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly configService: ConfigService) {}

  async handleIncomingWebhook(body: WhatsappWebhookDto): Promise<void> {
    const parsedMessage = parseWhatsappWebhookMessage(body);

    if (!parsedMessage) {
      this.logger.debug('Webhook received without valid customer message');
      return;
    }

    this.logger.log(
      `Incoming WhatsApp message from ${parsedMessage.from}: ${parsedMessage.text}`,
    );

    /**
     * Aquí todavía NO metemos IA.
     * Primero dejamos WhatsApp limpio y escalable.
     *
     * Después aquí conectaremos:
     *
     * const agentResponse = await this.agentService.chat({
     *   channel: 'whatsapp',
     *   sessionId: parsedMessage.from,
     *   message: parsedMessage.text,
     *   lang: 'es',
     * });
     *
     * await this.sendTextMessage(parsedMessage.from, agentResponse.reply);
     */

    await this.sendTextMessage(
      parsedMessage.from,
      '¡Hola! Soy el asistente de Ki’ichpam. Recibí tu mensaje correctamente. En breve podré ayudarte con paquetes, promociones y reservas.',
    );
  }

  async sendTextMessage(
    to: string,
    message: string,
  ): Promise<WhatsappSendMessageResponse> {
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const token = this.configService.get<string>('WHATSAPP_TOKEN');
    const apiVersion =
      this.configService.get<string>('WHATSAPP_API_VERSION') || 'v23.0';

    if (!phoneNumberId || !token) {
      throw new Error(
        'Missing WhatsApp configuration. Check WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN.',
      );
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await axios.post<WhatsappSendMessageResponse>(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`WhatsApp message sent to ${to}`);

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      this.logger.error(
        'Error sending WhatsApp message',
        axiosError.response?.data || axiosError.message,
      );

      throw error;
    }
  }
}