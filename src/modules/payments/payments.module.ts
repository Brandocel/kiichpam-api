import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentRecordsService } from './payment-records.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    GoogleCalendarModule,
    ReservationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentRecordsService],
  exports: [PaymentsService, PaymentRecordsService],
})
export class PaymentsModule {}