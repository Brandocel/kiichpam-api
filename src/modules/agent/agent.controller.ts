import { Body, Controller, Post } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentChatDto } from './dto/agent-chat.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  async chat(@Body() dto: AgentChatDto) {
    return this.agentService.chat({
      channel: dto.channel,
      sessionId: dto.sessionId,
      message: dto.message,
      lang: dto.lang ?? 'es',
    });
  }
}