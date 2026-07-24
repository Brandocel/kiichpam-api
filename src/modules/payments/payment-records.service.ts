import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Persiste en la tabla Payment el movimiento real de cada PaymentIntent.
 *
 * Stripe es la fuente de verdad del cobro, pero el panel administrativo
 * lee `reservation.payments`. Sin este registro una reservación puede
 * quedar en estado PAID y al mismo tiempo mostrarse "sin pagos registrados".
 *
 * Nunca lanza: si falla el guardado se registra en log y el flujo de pago
 * continúa, igual que se hace con la sincronización de Google Calendar.
 */
@Injectable()
export class PaymentRecordsService {
  private readonly logger = new Logger(PaymentRecordsService.name);

  private static readonly PROVIDER = 'STRIPE';

  constructor(private readonly prisma: PrismaService) {}

  async registerFromPaymentIntent(
    reservation: { id: string; folio: string },
    paymentIntent: Stripe.PaymentIntent,
  ) {
    try {
      const status = this.mapStripeStatus(paymentIntent.status);
      const method = this.resolveMethod(paymentIntent);
      const amountCentavos = this.resolveAmountCentavos(paymentIntent, status);

      await this.prisma.payment.upsert({
        where: {
          reservationId_reference: {
            reservationId: reservation.id,
            reference: paymentIntent.id,
          },
        },
        create: {
          reservationId: reservation.id,
          provider: PaymentRecordsService.PROVIDER,
          method,
          status,
          amountMXN: amountCentavos,
          reference: paymentIntent.id,
        },
        update: {
          provider: PaymentRecordsService.PROVIDER,
          method,
          status,
          amountMXN: amountCentavos,
        },
      });

      this.logger.log(
        `Movimiento de pago registrado: folio=${reservation.folio} intent=${paymentIntent.id} status=${status} method=${method}`,
      );
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `No se pudo registrar el movimiento de pago del folio ${reservation.folio}: ${message}`,
      );
    }
  }

  /**
   * El monto se guarda en centavos, igual que Reservation.totalMXN.
   * La conversión a pesos la hace la capa que expone la reservación.
   */
  private resolveAmountCentavos(
    paymentIntent: Stripe.PaymentIntent,
    status: string,
  ): number {
    const amount =
      status === 'SUCCEEDED'
        ? (paymentIntent.amount_received ?? paymentIntent.amount)
        : paymentIntent.amount;

    return Number.isInteger(amount) ? amount : 0;
  }

  private resolveMethod(paymentIntent: Stripe.PaymentIntent): string {
    if (paymentIntent.metadata?.paymentType === 'oxxo') {
      return 'OXXO';
    }

    const types = paymentIntent.payment_method_types ?? [];

    if (types.includes('oxxo')) {
      return 'OXXO';
    }

    if (types.includes('card')) {
      return 'CARD';
    }

    return (types[0] ?? 'UNKNOWN').toUpperCase();
  }

  private mapStripeStatus(stripeStatus: Stripe.PaymentIntent.Status): string {
    switch (stripeStatus) {
      case 'succeeded':
        return 'SUCCEEDED';

      case 'processing':
        return 'PROCESSING';

      case 'requires_action':
        return 'REQUIRES_ACTION';

      case 'canceled':
        return 'CANCELED';

      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_capture':
      default:
        return 'PENDING';
    }
  }
}
