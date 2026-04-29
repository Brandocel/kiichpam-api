import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { PackagesModule } from './modules/packages/packages.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { MediaModule } from './modules/media/media.module';
import { HeroModule } from './modules/hero/hero.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProposalReservationsModule } from './modules/proposal-reservations/proposal-reservations.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { LegalModule } from './modules/legal/legal.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    PackagesModule,
    ReservationsModule,
    CouponsModule,
    MediaModule,
    HeroModule,
    PaymentsModule,
    ProposalReservationsModule,
    CampaignsModule,
    WhatsappModule,
    LegalModule,
  ],
})
export class AppModule {}