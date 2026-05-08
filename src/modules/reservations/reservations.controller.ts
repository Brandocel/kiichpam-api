import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { IntegrationProtected } from '../../common/decorators/integration-protected.decorator';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly service: ReservationsService,
    private readonly lifecycleService: ReservationLifecycleService,
  ) {}

  /**
   * PÚBLICO
   * Este endpoint lo puede usar la web para cotizar una reservación.
   */
  @Post('quote')
  @ApiOperation({ summary: 'Cotizar una reservación' })
  quote(@Body() dto: QuoteDto) {
    return this.service.quote(dto);
  }

  /**
   * PÚBLICO
   * Este endpoint lo puede usar la web para crear una reservación.
   */
  @Post()
  @ApiOperation({ summary: 'Crear una reservación' })
  create(@Body() dto: QuoteDto) {
    return this.service.create(dto);
  }

  /**
   * PROTEGIDO
   * Lista reservaciones con datos de clientes, precios, estados y pagos.
   * Este endpoint no debe quedar público.
   */
  @Get()
  @IntegrationProtected()
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

  /**
   * PROTEGIDO
   * Muestra información interna del ciclo de vida de la reservación.
   */
  @Get(':folio/lifecycle')
  @IntegrationProtected()
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

  /**
   * PROTEGIDO
   * Muestra información interna del envío de correos.
   */
  @Get(':folio/email-status')
  @IntegrationProtected()
  @ApiOperation({
    summary: 'Consultar estado de correos de una reservación',
  })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  emailStatus(@Param('folio') folio: string) {
    return this.service.getEmailStatus(folio);
  }

  /**
   * PROTEGIDO
   * Consulta una reservación específica con datos del cliente.
   */
  @Get(':folio')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Consultar una reservación por folio' })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  findOne(@Param('folio') folio: string) {
    return this.service.findByFolio(folio);
  }

  /**
   * PROTEGIDO
   * Elimina una reservación por folio.
   * Borra también extras, pagos y trazas relacionadas para evitar errores de relaciones.
   */
  @Delete(':folio')
  @IntegrationProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una reservación por folio' })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  remove(@Param('folio') folio: string) {
    return this.service.deleteByFolio(folio);
  }

  /**
   * PROTEGIDO
   * Actualiza datos personales del cliente.
   */
  @Patch(':folio/contact')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Actualizar datos de contacto de una reservación' })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  updateContact(
    @Param('folio') folio: string,
    @Body() body: UpdateReservationContactDto,
  ) {
    return this.service.updateContact(folio, body);
  }

  /**
   * PROTEGIDO
   * Acción administrativa para marcar una reservación como pagada.
   */
  @Post(':folio/confirm-paid')
  @IntegrationProtected()
  @ApiOperation({
    summary: 'Marcar como pagada una reservación y enviar correo',
  })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  confirmPaid(@Param('folio') folio: string) {
    return this.service.confirmPaidAndSendEmail(folio);
  }

  /**
   * PROTEGIDO
   * Acción administrativa para reenviar correo.
   */
  @Post(':folio/resend-email')
  @IntegrationProtected()
  @ApiOperation({
    summary: 'Reenviar correo de reservación pagada',
  })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260424-LXY56S',
  })
  resendEmail(@Param('folio') folio: string) {
    return this.service.resendPaidReservationEmail(folio);
  }
}