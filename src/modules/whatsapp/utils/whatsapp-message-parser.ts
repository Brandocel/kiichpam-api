import { WhatsappWebhookDto } from '../dto/whatsapp-webhook.dto';
import { ParsedWhatsappMessage } from '../interfaces/whatsapp-message.interface';

export function parseWhatsappWebhookMessage(
  body: WhatsappWebhookDto,
): ParsedWhatsappMessage | null {
  const value = body?.entry?.[0]?.changes?.[0]?.value;

  const message = value?.messages?.[0];

  if (!message) {
    return null;
  }

  const contact = value?.contacts?.[0];

  const from = message.from;
  const messageId = message.id;
  const type = message.type || 'unknown';

  if (!from || !messageId) {
    return null;
  }

  let text = '';

  if (type === 'text') {
    text = message.text?.body || '';
  }

  if (type !== 'text') {
    text = `[${type}]`;
  }

  return {
    from,
    messageId,
    timestamp: message.timestamp,
    type,
    text,
    contactName: contact?.profile?.name,
    phoneNumberId: value?.metadata?.phone_number_id,
  };
}