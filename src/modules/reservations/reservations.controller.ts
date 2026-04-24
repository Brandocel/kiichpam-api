import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { QuoteDto } from './dto/quote.dto';
import { UpdateReservationContactDto } from './dto/update-reservation-contact.dto';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.service.quote(dto);
  }

  @Post()
  create(@Body() dto: QuoteDto) {
    return this.service.create(dto);
  }

  @Get(':folio')
  findOne(@Param('folio') folio: string) {
    return this.service.findByFolio(folio);
  }

  @Patch(':folio/contact')
  updateContact(
    @Param('folio') folio: string,
    @Body() body: UpdateReservationContactDto,
  ) {
    return this.service.updateContact(folio, body);
  }

  @Post(':folio/confirm-paid')
  confirmPaid(@Param('folio') folio: string) {
    return this.service.confirmPaidAndSendEmail(folio);
  }

  @Post(':folio/resend-email')
  resendEmail(@Param('folio') folio: string) {
    return this.service.resendPaidReservationEmail(folio);
  }

  @Get(':folio/email-status')
  emailStatus(@Param('folio') folio: string) {
    return this.service.getEmailStatus(folio);
  }
}