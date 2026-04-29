export interface ParsedWhatsappMessage {
    from: string;
    messageId: string;
    timestamp?: string;
    type: string;
    text: string;
    contactName?: string;
    phoneNumberId?: string;
  }
  
  export interface WhatsappSendMessageResponse {
    messaging_product: string;
    contacts?: Array<{
      input: string;
      wa_id: string;
    }>;
    messages?: Array<{
      id: string;
    }>;
  }