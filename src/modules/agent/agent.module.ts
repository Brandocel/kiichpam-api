import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentMemoryService } from './memory/agent-memory.service';
import { IntentClassifierService } from './intents/intent-classifier.service';
import { HumanHandoffService } from './handoff/human-handoff.service';
import { AgentConversationService } from './conversations/agent-conversation.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentMemoryService,
    IntentClassifierService,
    HumanHandoffService,
    AgentConversationService,
  ],
  exports: [AgentService],
})
export class AgentModule {}