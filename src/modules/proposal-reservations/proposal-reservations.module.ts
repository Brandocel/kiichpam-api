import { Module } from '@nestjs/common';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { ProposalReservationsController } from './proposal-reservations.controller';
import { ProposalReservationsService } from './proposal-reservations.service';

@Module({
  imports: [GoogleCalendarModule],
  controllers: [ProposalReservationsController],
  providers: [ProposalReservationsService],
})
export class ProposalReservationsModule {}