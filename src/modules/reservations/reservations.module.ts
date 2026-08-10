import { Module } from '@nestjs/common';

import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationPricingService } from './reservation-pricing.service';
import { ReservationMailService } from './reservation-mail.service';
import { ReservationLifecycleService } from './reservation-lifecycle.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CommonModule } from '../../common/common.module';
import { SalesAgentsModule } from '../sales-agents/sales-agents.module';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    CouponsModule,
    CampaignsModule,
    SalesAgentsModule,
  ],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationPricingService,
    ReservationMailService,
    ReservationLifecycleService,
  ],
  exports: [
    ReservationsService,
    ReservationPricingService,
    ReservationMailService,
    ReservationLifecycleService,
  ],
})
export class ReservationsModule {}