import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SalesAgentsController } from './sales-agents.controller';
import { SalesAgentsService } from './sales-agents.service';

@Module({
  imports: [CommonModule, PrismaModule],
  controllers: [SalesAgentsController],
  providers: [SalesAgentsService],
  exports: [SalesAgentsService],
})
export class SalesAgentsModule {}
