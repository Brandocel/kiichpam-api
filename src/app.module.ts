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
import { AgentModule } from './modules/agent/agent.module';
import { AiModule } from './modules/ai/ai.module';
import { PromotionsModule } from './modules/promotions/promotions.module';

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
    AgentModule,
    AiModule,
    PromotionsModule,
  ],
})
export class AppModule {}