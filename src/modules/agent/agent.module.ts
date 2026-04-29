import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentMemoryService } from './memory/agent-memory.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentController],
  providers: [AgentService, AgentMemoryService],
  exports: [AgentService],
})
export class AgentModule {}