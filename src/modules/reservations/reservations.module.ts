import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationPricingService } from './reservation-pricing.service';
import { ReservationMailService } from './reservation-mail.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [PrismaModule, CouponsModule, CampaignsModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    ReservationPricingService,
    ReservationMailService,
  ],
  exports: [
    ReservationsService,
    ReservationPricingService,
    ReservationMailService,
  ],
})
export class ReservationsModule {}