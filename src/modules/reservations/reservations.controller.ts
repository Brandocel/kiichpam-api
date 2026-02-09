import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { QuoteDto } from './dto/quote.dto';

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
  updateContact(@Param('folio') folio: string, @Body() body: any) {
    return this.service.updateContact(folio, body);
  }
}
