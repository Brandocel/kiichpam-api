export type AgentChannel = 'whatsapp' | 'web';

export type AgentIntent =
  | 'GREETING'
  | 'PACKAGE_INFO'
  | 'CAMPAIGN_INFO'
  | 'QUOTE_REQUEST'
  | 'RESERVATION_REQUEST'
  | 'HUMAN_HANDOFF'
  | 'UNKNOWN';

export interface AgentChatInput {
  channel: AgentChannel;
  sessionId: string;
  message: string;
  lang?: 'es' | 'en';
}

export interface AgentChatResponse {
  reply: string;
  intent: AgentIntent;
  handoffRequired: boolean;
}