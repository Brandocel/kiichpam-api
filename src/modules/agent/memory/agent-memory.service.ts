import { Injectable } from '@nestjs/common';

export interface AgentSessionMemory {
  sessionId: string;
  lastIntent?: string;
  lastMessage?: string;
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
      lastIntent: data.lastIntent ?? current?.lastIntent,
      lastMessage: data.lastMessage ?? current?.lastMessage,
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