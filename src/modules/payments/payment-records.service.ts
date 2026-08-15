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

  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY no está configurado');
    }

    this.stripe = new Stripe(secretKey);
  }

  async registerFromPaymentIntent(
    reservation: { id: string; folio: string },
    paymentIntent: Stripe.PaymentIntent,
  ) {
    try {
      const status = this.mapStripeStatus(paymentIntent.status);
      const method = await this.resolveMethod(paymentIntent);
      const amountCentavos = this.resolveAmountCentavos(paymentIntent, status);
      const kind =
        paymentIntent.metadata?.paymentKind === 'DEPOSIT' ? 'DEPOSIT' : 'FULL';

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
          kind,
          amountMXN: amountCentavos,
          reference: paymentIntent.id,
        },
        update: {
          provider: PaymentRecordsService.PROVIDER,
          method,
          status,
          kind,
          amountMXN: amountCentavos,
        },
      });

      await this.recalculateReservationBalance(reservation.id);

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
   * Recalcula `paidMXN` sumando los pagos liquidados de la reservación.
   *
   * Se recalcula entero en vez de incrementar para que reintentos, webhooks
   * duplicados o correcciones manuales no inflen el total: la tabla Payment
   * manda y este campo solo la refleja.
   *
   * Devuelve el saldo para que el llamador decida el estado.
   */
  async recalculateReservationBalance(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, totalMXN: true },
    });

    if (!reservation) {
      return null;
    }

    const aggregate = await this.prisma.payment.aggregate({
      where: { reservationId, status: 'SUCCEEDED' },
      _sum: { amountMXN: true },
    });

    const paidMXN = aggregate._sum.amountMXN ?? 0;

    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { paidMXN },
    });

    return {
      totalMXN: reservation.totalMXN,
      paidMXN,
      balanceMXN: Math.max(reservation.totalMXN - paidMXN, 0),
      isSettled: paidMXN >= reservation.totalMXN && reservation.totalMXN > 0,
    };
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

  /**
   * Con qué se pagó realmente.
   *
   * OJO: `payment_method_types` NO sirve para esto. Los cobros con tarjeta se
   * crean con `automatic_payment_methods`, y entonces Stripe devuelve ahí
   * **todos** los métodos habilitados en la cuenta, OXXO incluido. Mirar esa
   * lista hacía que cada pago con tarjeta se guardara como OXXO.
   *
   * El único dato confiable es el cargo liquidado
   * (`latest_charge.payment_method_details.type`), así que se consulta cuando
   * existe. Mientras el intent no se paga no hay forma de saberlo: en ese caso
   * se cae a la intención declarada al crearlo.
   */
  private async resolveMethod(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<string> {
    const settledMethod = await this.resolveMethodFromCharge(paymentIntent);

    if (settledMethod) {
      return settledMethod;
    }

    const declaredType = paymentIntent.metadata?.paymentType;

    if (declaredType === 'oxxo') {
      return 'OXXO';
    }

    if (declaredType === 'card') {
      return 'CARD';
    }

    const types = paymentIntent.payment_method_types ?? [];

    // Un único método permitido sí es concluyente (así se crea el de OXXO).
    if (types.length === 1) {
      return types[0].toUpperCase();
    }

    // Varios métodos habilitados y sin cargo todavía: no se puede afirmar.
    return 'PENDING';
  }

  /**
   * Lee el método del cargo real. `latest_charge` llega como id, así que hay
   * que traerlo. Si falla, se devuelve null para que el llamador use el
   * respaldo: registrar el movimiento importa más que la etiqueta exacta.
   */
  private async resolveMethodFromCharge(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<string | null> {
    const latestCharge = paymentIntent.latest_charge;

    if (!latestCharge) {
      return null;
    }

    try {
      const charge =
        typeof latestCharge === 'string'
          ? await this.stripe.charges.retrieve(latestCharge)
          : latestCharge;

      const type = charge?.payment_method_details?.type;

      return type ? type.toUpperCase() : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `No se pudo leer el método real del cargo ${String(latestCharge)}: ${message}`,
      );

      return null;
    }
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
