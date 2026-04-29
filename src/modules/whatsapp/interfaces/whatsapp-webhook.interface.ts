export interface WhatsappWebhookMetadata {
    displayPhoneNumber?: string;
    phoneNumberId?: string;
  }
  
  export interface WhatsappContact {
    name?: string;
    waId?: string;
  }
  
  export interface WhatsappWebhookStatus {
    id?: string;
    status?: string;
    timestamp?: string;
    recipientId?: string;
  }