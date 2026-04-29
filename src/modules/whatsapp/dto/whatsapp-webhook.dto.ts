export class WhatsappWebhookDto {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        value?: {
          messaging_product?: string;
          metadata?: {
            display_phone_number?: string;
            phone_number_id?: string;
          };
          contacts?: Array<{
            profile?: {
              name?: string;
            };
            wa_id?: string;
          }>;
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string;
            type?: string;
            text?: {
              body?: string;
            };
            image?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
            };
            audio?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              voice?: boolean;
            };
            document?: {
              id?: string;
              filename?: string;
              mime_type?: string;
              sha256?: string;
            };
            interactive?: unknown;
            button?: unknown;
          }>;
          statuses?: Array<{
            id?: string;
            status?: string;
            timestamp?: string;
            recipient_id?: string;
          }>;
        };
        field?: string;
      }>;
    }>;
  }