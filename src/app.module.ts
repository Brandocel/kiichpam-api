import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';

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
import { ContactModule } from './modules/contact/contact.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),

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
    ContactModule,
    AdminUsersModule,
  ],
})
export class AppModule {}