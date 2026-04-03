import * as common from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@common.Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @common.Post('intent')
  @ApiOperation({ summary: 'Crear PaymentIntent de Stripe para una reservación' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folio: { type: 'string', example: 'RSV-260310-BNEJ68' },
      },
      required: ['folio'],
    },
  })
  async createIntent(@common.Body() body: { folio: string }) {
    return this.paymentsService.createIntent(body.folio);
  }

  @common.Post('oxxo-reference')
  @ApiOperation({ summary: 'Generar referencia OXXO para una reservación' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folio: { type: 'string', example: 'RSV-260310-BNEJ68' },
      },
      required: ['folio'],
    },
  })
  async createOxxoReference(@common.Body() body: { folio: string }) {
    return this.paymentsService.createOxxoReference(body.folio);
  }

  @common.Get('status/:folio')
  @ApiOperation({ summary: 'Consultar estado de pago de una reservación' })
  @ApiParam({
    name: 'folio',
    example: 'RSV-260310-BNEJ68',
    description: 'Folio de la reservación',
  })
  async getPaymentStatus(@common.Param('folio') folio: string) {
    return this.paymentsService.getPaymentStatusByFolio(folio);
  }

  @common.Post('sync')
  @ApiOperation({ summary: 'Sincronizar manualmente estado de pago desde Stripe' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folio: { type: 'string', example: 'RSV-260310-BNEJ68' },
      },
      required: ['folio'],
    },
  })
  async syncPayment(@common.Body() body: { folio: string }) {
    return this.paymentsService.syncPaymentStatusFromStripe(body.folio);
  }

  @common.Post('refund')
  @ApiOperation({ summary: 'Reembolsar un pago exitoso en Stripe' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folio: { type: 'string', example: 'RSV-260310-BNEJ68' },
        amountMXN: { type: 'number', example: 5000, nullable: true },
        reason: {
          type: 'string',
          example: 'requested_by_customer',
          nullable: true,
          enum: ['duplicate', 'fraudulent', 'requested_by_customer'],
        },
      },
      required: ['folio'],
    },
  })
  async refundPayment(
    @common.Body()
    body: {
      folio: string;
      amountMXN?: number;
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    },
  ) {
    return this.paymentsService.refundPayment(body);
  }

  @common.Post('cancel')
  @ApiOperation({ summary: 'Cancelar un PaymentIntent no completado' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folio: { type: 'string', example: 'RSV-260310-BNEJ68' },
      },
      required: ['folio'],
    },
  })
  async cancelPayment(@common.Body() body: { folio: string }) {
    return this.paymentsService.cancelPayment(body.folio);
  }

  @common.Post('webhook')
  @ApiExcludeEndpoint()
  async handleWebhook(
    @common.Headers('stripe-signature') signature: string | undefined,
    @common.Req() req: common.RawBodyRequest<Request>,
  ) {
    return this.paymentsService.handleWebhook(signature, req.rawBody as Buffer);
  }
}