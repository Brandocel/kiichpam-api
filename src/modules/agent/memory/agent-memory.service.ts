import { Injectable } from '@nestjs/common';

export interface AgentSessionMemory {
  sessionId: string;

  botEnabled?: boolean;
  humanMode?: boolean;
  humanAssignedAt?: Date;
  humanAssignedBy?: string;

  lastIntent?: string;
  lastIntentScore?: number;
  lastMessage?: string;
  matchedWords?: string[];

  packageCode?: string;
  visitDate?: string;
  adults?: number;
  children?: number;
  infants?: number;

  name?: string;
  email?: string;
  phone?: string;

  updatedAt: Date;
}

@Injectable()
export class AgentMemoryService {
  private readonly sessions = new Map<string, AgentSessionMemory>();

  get(sessionId: string): AgentSessionMemory | null {
    return this.sessions.get(sessionId) ?? null;
  }

  update(
    sessionId: string,
    data: Partial<AgentSessionMemory>,
  ): AgentSessionMemory {
    const current = this.sessions.get(sessionId);

    const next: AgentSessionMemory = {
      sessionId,

      botEnabled: data.botEnabled ?? current?.botEnabled ?? true,
      humanMode: data.humanMode ?? current?.humanMode ?? false,
      humanAssignedAt:
        data.humanAssignedAt !== undefined
          ? data.humanAssignedAt
          : current?.humanAssignedAt,
      humanAssignedBy:
        data.humanAssignedBy !== undefined
          ? data.humanAssignedBy
          : current?.humanAssignedBy,

      lastIntent: data.lastIntent ?? current?.lastIntent,
      lastIntentScore: data.lastIntentScore ?? current?.lastIntentScore,
      lastMessage: data.lastMessage ?? current?.lastMessage,
      matchedWords: data.matchedWords ?? current?.matchedWords,

      packageCode: data.packageCode ?? current?.packageCode,
      visitDate: data.visitDate ?? current?.visitDate,
      adults: data.adults ?? current?.adults,
      children: data.children ?? current?.children,
      infants: data.infants ?? current?.infants,

      name: data.name ?? current?.name,
      email: data.email ?? current?.email,
      phone: data.phone ?? current?.phone,

      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, next);

    return next;
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}