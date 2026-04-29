import { Injectable } from '@nestjs/common';
import { AgentMemoryService } from '../memory/agent-memory.service';

@Injectable()
export class HumanHandoffService {
  constructor(private readonly memoryService: AgentMemoryService) {}

  isHumanMode(sessionId: string): boolean {
    const memory = this.memoryService.get(sessionId);

    return memory?.humanMode === true || memory?.botEnabled === false;
  }

  takeControl(sessionId: string, agentId?: string) {
    return this.memoryService.update(sessionId, {
      humanMode: true,
      botEnabled: false,
      humanAssignedAt: new Date(),
      humanAssignedBy: agentId,
    });
  }

  releaseControl(sessionId: string) {
    return this.memoryService.update(sessionId, {
      humanMode: false,
      botEnabled: true,
      humanAssignedAt: undefined,
      humanAssignedBy: undefined,
    });
  }

  disableBot(sessionId: string) {
    return this.memoryService.update(sessionId, {
      botEnabled: false,
    });
  }

  enableBot(sessionId: string) {
    return this.memoryService.update(sessionId, {
      botEnabled: true,
      humanMode: false,
    });
  }
}