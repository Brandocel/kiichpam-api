import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { ReservationLifecycleService } from './reservation-lifecycle.service';
import { QuoteDto } from './dto/quote.dto';
import { UpdateReservationContactDto } from './dto/update-reservation-contact.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly service: ReservationsService,
    private readonly lifecycleService: ReservationLifecycleService,
  ) {}

  @Post('quote')
  @ApiOperation({ summary: 'Cotizar una reservación' })
  quote(@Body() dto: QuoteDto) {
    return this.service.quote(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una reservación' })
  create(@Body() dto: QuoteDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar reservaciones con filtros básicos',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'RSV-260424',
    description: 'Busca por folio, nombre, apellido, email o teléfono',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    example: 'PAID',
  })
  @ApiQuery({
    name: 'packageCode',
    required: false,
    example: 'CENOTE',
  })
  @ApiQuery({
    name: 'email',
    required: false,
    example: 'cliente@gmail.com',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    example: '2026-04-01',
    description: 'Fecha inicial de visita',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    example: '2026-04-30',
    description: 'Fecha final de visita',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    example: 'createdAt',
    enum: ['createdAt', 'visitDate', 'totalMXN'],
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  findAll(@Query() query: QueryReservationsDto) {
    return this.service.findAll(query);
  }

  @Get(':folio/lifecycle')
  @ApiOperation({
    summary:
      'Consultar línea de vida blindada de una reservación: Stripe, correo y Google Calendar',
  })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  lifecycle(@Param('folio') folio: string) {
    return this.lifecycleService.getLifecycleByFolio(folio);
  }

  @Get(':folio/email-status')
  @ApiOperation({
    summary: 'Consultar estado de correos de una reservación',
  })
  emailStatus(@Param('folio') folio: string) {
    return this.service.getEmailStatus(folio);
  }

  @Get(':folio')
  @ApiOperation({ summary: 'Consultar una reservación por folio' })
  findOne(@Param('folio') folio: string) {
    return this.service.findByFolio(folio);
  }

  @Patch(':folio/contact')
  @ApiOperation({ summary: 'Actualizar datos de contacto de una reservación' })
  updateContact(
    @Param('folio') folio: string,
    @Body() body: UpdateReservationContactDto,
  ) {
    return this.service.updateContact(folio, body);
  }

  @Post(':folio/confirm-paid')
  @ApiOperation({
    summary: 'Marcar como pagada una reservación y enviar correo',
  })
  confirmPaid(@Param('folio') folio: string) {
    return this.service.confirmPaidAndSendEmail(folio);
  }

  @Post(':folio/resend-email')
  @ApiOperation({
    summary: 'Reenviar correo de reservación pagada',
  })
  resendEmail(@Param('folio') folio: string) {
    return this.service.resendPaidReservationEmail(folio);
  }
}