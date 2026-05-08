import { Module } from '@nestjs/common';

import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}