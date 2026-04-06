import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { PackagesModule } from './modules/packages/packages.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { MediaModule } from './modules/media/media.module';
import { HeroModule } from './modules/hero/hero.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProposalReservationsModule } from './modules/proposal-reservations/proposal-reservations.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    PackagesModule,
    ReservationsModule,
    CouponsModule,
    MediaModule,
    HeroModule,
    PaymentsModule,
    ProposalReservationsModule,
  ],
})
export class AppModule {}