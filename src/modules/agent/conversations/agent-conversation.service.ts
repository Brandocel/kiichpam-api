import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AgentConversationStatus,
  AgentMessageChannel,
  AgentMessageDirection,
  AgentMessageSender,
} from '@prisma/client';

@Injectable()
export class AgentConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(params: {
    sessionId: string;
    channel: 'whatsapp' | 'web';
  }) {
    return this.prisma.agentConversation.upsert({
      where: {
        sessionId: params.sessionId,
      },
      update: {
        channel: this.mapChannel(params.channel),
        lastCustomerAt: new Date(),
      },
      create: {
        sessionId: params.sessionId,
        channel: this.mapChannel(params.channel),
        status: AgentConversationStatus.BOT_ACTIVE,
        botEnabled: true,
        humanMode: false,
        lastCustomerAt: new Date(),
      },
    });
  }

  async updateContext(
    sessionId: string,
    data: {
      lastIntent?: string;
      lastIntentScore?: number;
      lastMessage?: string;
      matchedWords?: string[];
      packageCode?: string;
      visitDate?: string;
      adults?: number;
      children?: number;
      infants?: number;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    },
  ) {
    return this.prisma.agentConversation.update({
      where: {
        sessionId,
      },
      data: {
        lastIntent: data.lastIntent,
        lastIntentScore: data.lastIntentScore,
        lastMessage: data.lastMessage,
        matchedWords: data.matchedWords ?? undefined,
        packageCode: data.packageCode,
        visitDate: data.visitDate,
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
      },
    });
  }

  async addMessage(params: {
    sessionId: string;
    sender: AgentMessageSender;
    channel: 'whatsapp' | 'web';
    direction: AgentMessageDirection;
    message: string;
    intent?: string;
    intentScore?: number;
    packageCode?: string;
    metadata?: Record<string, any>;
  }) {
    const conversation = await this.getOrCreate({
      sessionId: params.sessionId,
      channel: params.channel,
    });

    const created = await this.prisma.agentConversationMessage.create({
      data: {
        conversationId: conversation.id,
        sender: params.sender,
        channel: this.mapChannel(params.channel),
        direction: params.direction,
        message: params.message,
        intent: params.intent,
        intentScore: params.intentScore,
        packageCode: params.packageCode,
        metadata: params.metadata,
      },
    });

    await this.touchConversationBySender(params.sessionId, params.sender);

    return created;
  }

  async getMemoryText(sessionId: string): Promise<string> {
    const conversation = await this.prisma.agentConversation.findUnique({
      where: {
        sessionId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 8,
        },
      },
    });

    if (!conversation) {
      return 'Sin memoria previa.';
    }

    const messages = [...conversation.messages]
      .reverse()
      .map((item) => {
        return `${item.sender}: ${item.message}`;
      })
      .join('\n');

    return `
Estado del chat: ${conversation.status}
Bot activo: ${conversation.botEnabled ? 'sí' : 'no'}
Modo humano: ${conversation.humanMode ? 'sí' : 'no'}

Última intención: ${conversation.lastIntent ?? 'N/A'}
Score intención: ${conversation.lastIntentScore ?? 'N/A'}
Último mensaje: ${conversation.lastMessage ?? 'N/A'}

Paquete detectado: ${conversation.packageCode ?? 'N/A'}
Fecha detectada: ${conversation.visitDate ?? 'N/A'}
Adultos: ${conversation.adults ?? 'N/A'}
Niños: ${conversation.children ?? 'N/A'}
Infantes: ${conversation.infants ?? 'N/A'}

Últimos mensajes:
${messages || 'Sin mensajes previos.'}
`;
  }

  async isHumanMode(sessionId: string): Promise<boolean> {
    const conversation = await this.prisma.agentConversation.findUnique({
      where: {
        sessionId,
      },
    });

    if (!conversation) {
      return false;
    }

    return conversation.humanMode === true || conversation.botEnabled === false;
  }

  async takeHumanControl(sessionId: string, agentId?: string) {
    return this.prisma.agentConversation.upsert({
      where: {
        sessionId,
      },
      update: {
        status: AgentConversationStatus.HUMAN_ACTIVE,
        humanMode: true,
        botEnabled: false,
        assignedTo: agentId,
        assignedAt: new Date(),
      },
      create: {
        sessionId,
        status: AgentConversationStatus.HUMAN_ACTIVE,
        humanMode: true,
        botEnabled: false,
        assignedTo: agentId,
        assignedAt: new Date(),
      },
    });
  }

  async releaseHumanControl(sessionId: string) {
    return this.prisma.agentConversation.update({
      where: {
        sessionId,
      },
      data: {
        status: AgentConversationStatus.BOT_ACTIVE,
        humanMode: false,
        botEnabled: true,
        assignedTo: null,
        assignedAt: null,
      },
    });
  }

  private async touchConversationBySender(
    sessionId: string,
    sender: AgentMessageSender,
  ) {
    if (sender === AgentMessageSender.CUSTOMER) {
      await this.prisma.agentConversation.update({
        where: { sessionId },
        data: { lastCustomerAt: new Date() },
      });
    }

    if (sender === AgentMessageSender.BOT) {
      await this.prisma.agentConversation.update({
        where: { sessionId },
        data: { lastBotAt: new Date() },
      });
    }

    if (sender === AgentMessageSender.HUMAN) {
      await this.prisma.agentConversation.update({
        where: { sessionId },
        data: { lastHumanAt: new Date() },
      });
    }
  }

  private mapChannel(channel: 'whatsapp' | 'web'): AgentMessageChannel {
    return channel === 'web'
      ? AgentMessageChannel.WEB
      : AgentMessageChannel.WHATSAPP;
  }
}