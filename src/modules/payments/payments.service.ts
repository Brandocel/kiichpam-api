import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { ReservationMailService } from '../reservations/reservation-mail.service';
import { PaymentRecordsService } from './payment-records.service';

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly reservationMailService: ReservationMailService,
    private readonly paymentRecordsService: PaymentRecordsService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY no está configurado');
    }

    this.stripe = new Stripe(secretKey);
  }

  private get packageEmailInclude() {
    return {
      coverMedia: true,
      translations: {
        where: {
          lang: 'es',
        },
        select: {
          lang: true,
          name: true,
          description: true,
          includes: true,
          excludes: true,
          notes: true,
        },
      },
    };
  }

  private getStripeAmountFromReservationTotal(totalCentavos: unknown): number {
    const amount = Number(totalCentavos);

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Monto inválido. El total de la reservación debe estar guardado en centavos.',
      );
    }

    if (amount < 100) {
      throw new BadRequestException(
        'Monto demasiado bajo para Stripe. Revisa el total de la reservación.',
      );
    }

    if (amount > 5000000) {
      throw new BadRequestException(
        'Monto demasiado alto para Stripe. Revisa el total antes de cobrar.',
      );
    }

    return amount;
  }

  private toMXNFromCentavos(value: unknown): number {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    return amount / 100;
  }

  private buildCardResponse(
    reservation: {
      id: string;
      folio: string;
      totalMXN: unknown;
      currency: string | null;
      status?: string;
    },
    paymentIntent: Stripe.PaymentIntent,
    currency: string,
  ) {
    return {
      folio: reservation.folio,
      status: paymentIntent.status,
      currency: (reservation.currency ?? currency ?? 'MXN').toUpperCase(),
      totalMXN: this.toMXNFromCentavos(reservation.totalMXN),
      totalCentavos: Number(reservation.totalMXN),
      reservationId: reservation.id,
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        amountMXN: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      },
    };
  }

  private buildOxxoResponse(
    reservation: {
      id: string;
      folio: string;
      totalMXN: unknown;
      currency: string | null;
    },
    paymentIntent: Stripe.PaymentIntent,
    reused: boolean,
    message: string,
  ) {
    const oxxoDetails = this.getOxxoDisplayDetails(paymentIntent);

    return {
      folio: reservation.folio,
      status: paymentIntent.status,
      currency: (reservation.currency ?? 'MXN').toUpperCase(),
      totalMXN: this.toMXNFromCentavos(reservation.totalMXN),
      totalCentavos: Number(reservation.totalMXN),
      reservationId: reservation.id,
      paymentMethod: 'oxxo',
      reference: oxxoDetails?.number ?? null,
      expiresAt: oxxoDetails?.expiresAfter
        ? new Date(oxxoDetails.expiresAfter * 1000).toISOString()
        : null,
      hostedVoucherUrl: oxxoDetails?.hostedVoucherUrl ?? null,
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        amountMXN: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      },
      reused,
      message,
    };
  }

  async createIntent(folio: string) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    if (reservation.status === 'PAID') {
      throw new BadRequestException('La reservación ya está pagada');
    }

    if (reservation.status === 'PROCESSING_PAYMENT') {
      throw new BadRequestException(
        'La reservación ya tiene un pago en proceso',
      );
    }

    const currency = (reservation.currency ?? 'MXN').toLowerCase();

    if (currency !== 'mxn') {
      throw new BadRequestException(
        'Por seguridad, solo se permiten pagos en MXN',
      );
    }

    const stripeAmount = this.getStripeAmountFromReservationTotal(
      reservation.totalMXN,
    );

    this.logger.warn(
      `[CARD_AMOUNT_CHECK] folio=${reservation.folio} totalCentavos=${stripeAmount} totalMXN=${stripeAmount / 100}`,
    );

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: stripeAmount,
        currency,
        metadata: {
          folio: reservation.folio,
          reservationId: reservation.id,
          packageId: reservation.packageId,
          amountUnit: 'centavos',
          totalCentavos: String(stripeAmount),
          totalMXN: String(stripeAmount / 100),
          // Intención declarada. Sirve de respaldo para etiquetar el método
          // mientras no exista un cargo liquidado que lo confirme, porque
          // automatic_payment_methods lista todos los métodos de la cuenta.
          paymentType: 'card',
        },
        description: `Pago de reservación ${reservation.folio}`,
        automatic_payment_methods: {
          enabled: true,
        },
      },
      {
        idempotencyKey: `reservation-card-${reservation.folio}-${stripeAmount}`,
      },
    );

    this.logger.log(
      `PaymentIntent creado: ${paymentIntent.id} para folio ${reservation.folio} por $${stripeAmount / 100} MXN`,
    );

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );

    return this.buildCardResponse(reservation, paymentIntent, currency);
  }

  /**
   * Genera un link de cobro por una parte del total (anticipo).
   *
   * Sustituye a los Payment Links que hoy se crean a mano en el dashboard de
   * Stripe: al pasar por aquí, el cobro queda amarrado al folio, aparece en la
   * tabla Payment y cuenta para las métricas y la comisión del agente.
   *
   * El paquete y el precio salen de la reservación, que a su vez viene del
   * catálogo cargado: el agente solo elige cuánto se cobra ahora.
   */
  async createDepositCheckout(folio: string, amountMXN: number) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    if (reservation.status === 'PAID') {
      throw new BadRequestException('La reservación ya está liquidada');
    }

    const currency = (reservation.currency ?? 'MXN').toLowerCase();

    if (currency !== 'mxn') {
      throw new BadRequestException(
        'Por seguridad, solo se permiten pagos en MXN',
      );
    }

    if (!Number.isFinite(amountMXN) || amountMXN <= 0) {
      throw new BadRequestException('El monto del anticipo es inválido');
    }

    const amountCentavos = Math.round(Number(amountMXN) * 100);

    // Stripe no procesa cobros ridículamente chicos en MXN.
    if (amountCentavos < 1000) {
      throw new BadRequestException(
        'El anticipo mínimo que acepta Stripe es de $10.00 MXN',
      );
    }

    const balanceCentavos = Math.max(
      reservation.totalMXN - reservation.paidMXN,
      0,
    );

    if (balanceCentavos <= 0) {
      throw new BadRequestException(
        'Esta reservación ya no tiene saldo pendiente',
      );
    }

    // El tope es el saldo, no el total: así dos anticipos nunca cobran de más.
    if (amountCentavos > balanceCentavos) {
      throw new BadRequestException(
        `El monto no puede superar el saldo pendiente de $${(balanceCentavos / 100).toFixed(2)} MXN`,
      );
    }

    const isSettlingPayment = amountCentavos === balanceCentavos;

    const packageName =
      reservation.snapshotName ??
      reservation.package?.translations?.[0]?.name ??
      reservation.package?.code ??
      'Reservación';

    const siteUrl = (
      process.env.FRONTEND_URL || 'https://www.cenotexunaan.com'
    ).replace(/\/$/, '');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${siteUrl}/es/reservar?folio=${normalizedFolio}&pago=exitoso`,
      cancel_url: `${siteUrl}/es/reservar?folio=${normalizedFolio}&pago=cancelado`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: amountCentavos,
            product_data: {
              name: isSettlingPayment
                ? `${packageName} — pago restante`
                : `${packageName} — anticipo`,
              description: `Reservación ${normalizedFolio}`,
            },
          },
        },
      ],
      metadata: {
        folio: normalizedFolio,
        reservationId: reservation.id,
        paymentKind: 'DEPOSIT',
      },
      // La metadata del intent es la que lee el webhook para saber que se
      // trata de un cobro parcial y no marcar la reservación como liquidada.
      payment_intent_data: {
        description: `Anticipo de reservación ${normalizedFolio}`,
        metadata: {
          folio: normalizedFolio,
          reservationId: reservation.id,
          packageId: reservation.packageId,
          amountUnit: 'centavos',
          paymentKind: 'DEPOSIT',
          totalCentavos: String(reservation.totalMXN),
        },
      },
    });

    await this.prisma.reservationTrace.create({
      data: {
        reservationId: reservation.id,
        folio: normalizedFolio,
        step: 'DEPOSIT_LINK_CREATED',
        message: `Link de anticipo generado por $${(amountCentavos / 100).toFixed(2)} MXN`,
        metadata: {
          checkoutSessionId: session.id,
          amountCentavos,
          balanceBeforeCentavos: balanceCentavos,
          isSettlingPayment,
        },
      },
    });

    return {
      folio: normalizedFolio,
      url: session.url,
      checkoutSessionId: session.id,
      amountMXN: amountCentavos / 100,
      totalMXN: reservation.totalMXN / 100,
      paidMXN: reservation.paidMXN / 100,
      balanceAfterMXN: (balanceCentavos - amountCentavos) / 100,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
    };
  }

  async createOxxoReference(folio: string) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    if (reservation.status === 'PAID') {
      throw new BadRequestException('La reservación ya está pagada');
    }

    if ((reservation.currency ?? 'MXN').toUpperCase() !== 'MXN') {
      throw new BadRequestException(
        'OXXO solo se puede generar para pagos en MXN',
      );
    }

    const customerName = [reservation.firstName, reservation.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!customerName || customerName.length < 5) {
      throw new BadRequestException(
        'Para generar referencia OXXO la reservación debe tener nombre y apellido del cliente',
      );
    }

    if (!reservation.email) {
      throw new BadRequestException(
        'Para generar referencia OXXO la reservación debe tener email',
      );
    }

    const existingOxxoIntent =
      await this.findActiveOxxoPaymentIntentByFolio(normalizedFolio);

    if (existingOxxoIntent) {
      await this.prisma.reservation.update({
        where: { folio: normalizedFolio },
        data: {
          status: 'PROCESSING_PAYMENT',
        },
      });

      await this.paymentRecordsService.registerFromPaymentIntent(
        reservation,
        existingOxxoIntent,
      );

      return this.buildOxxoResponse(
        {
          id: reservation.id,
          folio: reservation.folio,
          totalMXN: reservation.totalMXN,
          currency: reservation.currency,
        },
        existingOxxoIntent,
        true,
        'Ya existía una referencia OXXO activa para esta reservación',
      );
    }

    const stripeAmount = this.getStripeAmountFromReservationTotal(
      reservation.totalMXN,
    );

    this.logger.warn(
      `[OXXO_AMOUNT_CHECK] folio=${reservation.folio} totalCentavos=${stripeAmount} totalMXN=${stripeAmount / 100}`,
    );

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: stripeAmount,
        currency: 'mxn',
        confirm: true,
        payment_method_data: {
          type: 'oxxo',
          billing_details: {
            name: customerName,
            email: reservation.email,
          },
        },
        payment_method_types: ['oxxo'],
        payment_method_options: {
          oxxo: {
            expires_after_days: 3,
          },
        },
        metadata: {
          folio: reservation.folio,
          reservationId: reservation.id,
          packageId: reservation.packageId,
          paymentType: 'oxxo',
          amountUnit: 'centavos',
          totalCentavos: String(stripeAmount),
          totalMXN: String(stripeAmount / 100),
        },
        description: `Referencia OXXO de reservación ${reservation.folio}`,
      },
      {
        idempotencyKey: `reservation-oxxo-${reservation.folio}-${stripeAmount}`,
      },
    );

    const oxxoDetails = this.getOxxoDisplayDetails(paymentIntent);

    if (!oxxoDetails?.hostedVoucherUrl) {
      this.logger.error(
        `Stripe no devolvió hosted_voucher_url para el folio ${reservation.folio}`,
      );

      throw new BadRequestException(
        'Stripe no devolvió la referencia OXXO. Verifica la configuración del método de pago.',
      );
    }

    await this.prisma.reservation.update({
      where: { folio: normalizedFolio },
      data: {
        status: 'PROCESSING_PAYMENT',
      },
    });

    this.logger.log(
      `Referencia OXXO generada: ${paymentIntent.id} para folio ${reservation.folio} por $${stripeAmount / 100} MXN`,
    );

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );

    return this.buildOxxoResponse(
      {
        id: reservation.id,
        folio: reservation.folio,
        totalMXN: reservation.totalMXN,
        currency: reservation.currency,
      },
      paymentIntent,
      false,
      'Referencia OXXO generada correctamente',
    );
  }

  async getPaymentStatusByFolio(folio: string) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const paymentStatus = this.mapReservationStatus(reservation.status);

    return {
      reservationId: reservation.id,
      folio: reservation.folio,
      reservationStatus: reservation.status,
      paymentStatus: paymentStatus.code,
      paymentMessage: paymentStatus.message,
      isPaid: reservation.status === 'PAID',
      canRetryPayment: ['DRAFT', 'PAYMENT_FAILED', 'CANCELED'].includes(
        reservation.status,
      ),
      totalMXN: this.toMXNFromCentavos(reservation.totalMXN),
      totalCentavos: Number(reservation.totalMXN),
      currency: reservation.currency,
      customer: {
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        email: reservation.email,
        phone: reservation.phone,
        country: reservation.country,
      },
      visitDate: reservation.visitDate,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
      payments: reservation.payments,
      package: reservation.package
        ? {
            id: reservation.package.id,
            code: reservation.package.code,
            currency: reservation.package.currency,
            coverMedia: reservation.package.coverMedia,
            translation: reservation.package.translations?.[0] ?? null,
          }
        : null,
      extras: reservation.extras,
    };
  }

  async syncPaymentStatusFromStripe(folio: string) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const paymentIntent = await this.findPaymentIntentByFolio(normalizedFolio);

    if (!paymentIntent) {
      return {
        synced: false,
        folio: normalizedFolio,
        message: 'No se encontró ningún PaymentIntent en Stripe para este folio',
      };
    }

    this.validateStripeAmountMatchesReservation(reservation, paymentIntent);

    // Igual que en el webhook: primero se registra el movimiento para saber
    // cuánto lleva cubierto y recién entonces se decide el estado.
    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );

    const settlement =
      await this.paymentRecordsService.recalculateReservationBalance(
        reservation.id,
      );

    let newStatus = reservation.status;

    switch (paymentIntent.status) {
      case 'succeeded':
        newStatus = settlement?.isSettled === false ? 'PARTIALLY_PAID' : 'PAID';
        break;

      case 'processing':
        newStatus = 'PROCESSING_PAYMENT';
        break;

      case 'canceled':
        newStatus = 'CANCELED';
        break;

      case 'requires_payment_method':
        newStatus = 'DRAFT';
        break;

      case 'requires_action':
        newStatus = paymentIntent.payment_method_types?.includes('oxxo')
          ? 'PROCESSING_PAYMENT'
          : 'DRAFT';
        break;

      case 'requires_confirmation':
      case 'requires_capture':
        newStatus = 'DRAFT';
        break;

      default:
        newStatus = reservation.status;
        break;
    }

    const updatedReservation = await this.prisma.reservation.update({
      where: { folio: normalizedFolio },
      data: {
        status: newStatus,
      },
      include: {
        extras: true,
        payments: true,
        traces: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (newStatus === 'PAID') {
      await this.syncReservationToGoogleCalendar(normalizedFolio);
      await this.sendPaidReservationEmailsFromWebhook(updatedReservation);
    }

    const paymentStatus = this.mapReservationStatus(updatedReservation.status);

    return {
      synced: true,
      folio: normalizedFolio,
      stripePaymentIntentId: paymentIntent.id,
      stripeStatus: paymentIntent.status,
      reservationStatus: updatedReservation.status,
      paymentStatus: paymentStatus.code,
      paymentMessage: paymentStatus.message,
      isPaid: updatedReservation.status === 'PAID',
      message: 'Reservación sincronizada correctamente con Stripe',
    };
  }

  async refundPayment(body: {
    folio: string;
    amountMXN?: number;
    reason?: RefundReason;
  }) {
    const { folio, amountMXN, reason } = body;

    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const paymentIntent = await this.findPaymentIntentByFolio(normalizedFolio);

    if (!paymentIntent) {
      throw new NotFoundException(
        `No se encontró un PaymentIntent en Stripe para el folio ${normalizedFolio}`,
      );
    }

    this.validateStripeAmountMatchesReservation(reservation, paymentIntent);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `El pago no está exitoso en Stripe. Estado actual: ${paymentIntent.status}`,
      );
    }

    const chargeId = this.getChargeIdFromPaymentIntent(paymentIntent);

    if (!chargeId) {
      throw new BadRequestException(
        'No se encontró un cargo asociado al PaymentIntent para reembolsar',
      );
    }

    let amount: number | undefined = undefined;

    if (amountMXN !== undefined) {
      if (!Number.isFinite(amountMXN) || amountMXN <= 0) {
        throw new BadRequestException('El monto a reembolsar es inválido');
      }

      amount = Math.round(Number(amountMXN) * 100);

      if (amount > (paymentIntent.amount_received ?? paymentIntent.amount)) {
        throw new BadRequestException(
          'El monto a reembolsar no puede ser mayor al monto pagado',
        );
      }
    }

    const refund = await this.stripe.refunds.create({
      charge: chargeId,
      amount,
      reason,
      metadata: {
        folio: normalizedFolio,
        reservationId: reservation.id,
      },
    });

    const refundAmountMXN =
      typeof refund.amount === 'number' ? refund.amount / 100 : null;

    const isFullRefund =
      refund.status === 'succeeded' &&
      (refund.amount ?? 0) >=
        (paymentIntent.amount_received ?? paymentIntent.amount);

    if (isFullRefund) {
      try {
        await this.googleCalendarService.cancelReservationEventByFolio(
          normalizedFolio,
          reservation.visitDate,
        );
      } catch (error: any) {
        this.logger.error(
          `No se pudo cancelar el evento de Google Calendar del folio ${normalizedFolio}: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      folio: normalizedFolio,
      reservationStatus: reservation.status,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: chargeId,
      refund: {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        amountMXN: refundAmountMXN,
        currency: refund.currency,
        reason: refund.reason,
      },
      message: isFullRefund
        ? 'Reembolso completo realizado correctamente'
        : 'Reembolso procesado correctamente',
    };
  }

  async cancelPayment(folio: string) {
    if (!folio || typeof folio !== 'string') {
      throw new BadRequestException('El folio es obligatorio');
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const paymentIntent = await this.findPaymentIntentByFolio(normalizedFolio);

    if (!paymentIntent) {
      throw new NotFoundException(
        `No se encontró un PaymentIntent en Stripe para el folio ${normalizedFolio}`,
      );
    }

    if (paymentIntent.status === 'succeeded') {
      throw new BadRequestException(
        'Este pago ya fue completado. No se puede cancelar, debes hacer un reembolso.',
      );
    }

    if (paymentIntent.status === 'canceled') {
      return {
        success: true,
        folio: normalizedFolio,
        stripePaymentIntentId: paymentIntent.id,
        stripeStatus: paymentIntent.status,
        reservationStatus: reservation.status,
        message: 'El PaymentIntent ya estaba cancelado',
      };
    }

    const isOxxoPayment = paymentIntent.payment_method_types?.includes('oxxo');

    if (
      isOxxoPayment &&
      ['requires_action', 'processing'].includes(paymentIntent.status)
    ) {
      throw new BadRequestException(
        'Una referencia OXXO activa no puede cancelarse antes de su vencimiento',
      );
    }

    const cancelableStatuses = [
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'requires_capture',
    ];

    if (!cancelableStatuses.includes(paymentIntent.status)) {
      throw new BadRequestException(
        `El PaymentIntent no puede cancelarse en su estado actual: ${paymentIntent.status}`,
      );
    }

    const canceledIntent = await this.stripe.paymentIntents.cancel(
      paymentIntent.id,
    );

    await this.prisma.reservation.update({
      where: { folio: normalizedFolio },
      data: {
        status: 'CANCELED',
      },
    });

    return {
      success: true,
      folio: normalizedFolio,
      stripePaymentIntentId: canceledIntent.id,
      stripeStatus: canceledIntent.status,
      reservationStatus: 'CANCELED',
      paymentStatus: 'canceled',
      paymentMessage: 'El pago fue cancelado correctamente',
      message: 'PaymentIntent cancelado correctamente',
    };
  }

  async handleWebhook(signature: string | undefined, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET no está configurado');
    }

    if (!signature) {
      throw new BadRequestException('Falta el header stripe-signature');
    }

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Raw body inválido para webhook');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error: any) {
      throw new BadRequestException(
        `Firma inválida del webhook: ${error.message}`,
      );
    }

    this.logger.log(`Evento recibido de Stripe: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.processing':
        await this.handlePaymentIntentProcessing(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.canceled':
        await this.handlePaymentIntentCanceled(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.requires_action':
        await this.handlePaymentIntentRequiresAction(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      default:
        this.logger.warn(`Evento Stripe no manejado: ${event.type}`);
        break;
    }

    return { received: true };
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.succeeded (${paymentIntent.id})`,
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
      include: {
        extras: true,
        payments: true,
        traces: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    if (!reservation) {
      this.logger.warn(`No existe reservación con folio=${folio}`);
      return;
    }

    this.validateStripeAmountMatchesReservation(reservation, paymentIntent);

    // Se registra el movimiento ANTES de decidir el estado: eso recalcula
    // cuánto lleva pagado la reservación y permite distinguir un anticipo de
    // una liquidación. Marcar PAID sin mirar el saldo haría que un anticipo
    // del 50% apareciera como pagado completo.
    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );

    const balance = await this.paymentRecordsService.recalculateReservationBalance(
      reservation.id,
    );

    const isSettled = balance?.isSettled ?? true;
    const newStatus = isSettled ? 'PAID' : 'PARTIALLY_PAID';

    const updatedReservation = await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: newStatus,
        traces: {
          create: {
            folio,
            step: isSettled
              ? 'STRIPE_PAYMENT_SUCCEEDED'
              : 'STRIPE_DEPOSIT_SUCCEEDED',
            message: isSettled
              ? 'Stripe confirmed payment_intent.succeeded'
              : 'Stripe confirmó un anticipo: queda saldo pendiente',
            metadata: {
              stripePaymentIntentId: paymentIntent.id,
              stripeStatus: paymentIntent.status,
              amountCentavos: paymentIntent.amount,
              amountReceivedCentavos: paymentIntent.amount_received,
              amountMXN: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              previousStatus: reservation.status,
              paidCentavos: balance?.paidMXN ?? null,
              balanceCentavos: balance?.balanceMXN ?? null,
            },
          },
        },
      },
      include: {
        extras: true,
        payments: true,
        traces: true,
        package: {
          include: this.packageEmailInclude,
        },
      },
    });

    // El correo de confirmación y el evento de calendario solo salen cuando la
    // reservación queda liquidada: un anticipo todavía no garantiza la visita.
    if (!isSettled) {
      this.logger.log(
        `Anticipo registrado para folio=${folio}. Pagado=${(balance?.paidMXN ?? 0) / 100} Saldo=${(balance?.balanceMXN ?? 0) / 100}`,
      );
      return;
    }

    await this.syncReservationToGoogleCalendar(folio);
    await this.sendPaidReservationEmailsFromWebhook(updatedReservation);
  }

  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.payment_failed (${paymentIntent.id})`,
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
    });

    if (!reservation) {
      this.logger.warn(`No existe reservación con folio=${folio}`);
      return;
    }

    await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: 'PAYMENT_FAILED',
      },
    });

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );
  }

  private async handlePaymentIntentProcessing(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.processing (${paymentIntent.id})`,
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
    });

    if (!reservation) {
      this.logger.warn(`No existe reservación con folio=${folio}`);
      return;
    }

    await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: 'PROCESSING_PAYMENT',
      },
    });

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );
  }

  private async handlePaymentIntentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.canceled (${paymentIntent.id})`,
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
    });

    if (!reservation) {
      this.logger.warn(`No existe reservación con folio=${folio}`);
      return;
    }

    await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: 'CANCELED',
      },
    });

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );
  }

  private async handlePaymentIntentRequiresAction(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.requires_action (${paymentIntent.id})`,
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
    });

    if (!reservation) {
      this.logger.warn(`No existe reservación con folio=${folio}`);
      return;
    }

    await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: 'PROCESSING_PAYMENT',
      },
    });

    await this.paymentRecordsService.registerFromPaymentIntent(
      reservation,
      paymentIntent,
    );
  }

  /**
   * Verifica que lo cobrado en Stripe sea coherente con la reservación.
   *
   * Antes se exigía igualdad exacta con el total, lo que hacía imposible un
   * anticipo. Ahora se acepta cualquier monto que no **exceda** el total: un
   * cobro de más sigue siendo un error grave (precio manipulado) y se bloquea,
   * pero cobrar de menos es un pago parcial legítimo.
   *
   * Los anticipos se marcan con `paymentKind=DEPOSIT` en la metadata, así que
   * un intent sin esa marca que no cubra el total sí se reporta como anomalía.
   */
  private validateStripeAmountMatchesReservation(
    reservation: { folio: string; totalMXN: unknown },
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const reservationAmount = this.getStripeAmountFromReservationTotal(
      reservation.totalMXN,
    );

    const stripeAmount = paymentIntent.amount_received || paymentIntent.amount;

    if (stripeAmount > reservationAmount) {
      this.logger.error(
        `[PAYMENT_AMOUNT_OVERCHARGE] folio=${reservation.folio} reservationCentavos=${reservationAmount} stripeCentavos=${stripeAmount} reservationMXN=${reservationAmount / 100} stripeMXN=${stripeAmount / 100}`,
      );

      throw new BadRequestException(
        'El monto cobrado en Stripe es mayor al total de la reservación. No se marcará como pagada por seguridad.',
      );
    }

    const isDeposit = paymentIntent.metadata?.paymentKind === 'DEPOSIT';

    if (stripeAmount < reservationAmount && !isDeposit) {
      this.logger.warn(
        `[PAYMENT_PARTIAL_UNDECLARED] folio=${reservation.folio} reservationCentavos=${reservationAmount} stripeCentavos=${stripeAmount}. Se registrará como pago parcial.`,
      );
    }
  }

  private async sendPaidReservationEmailsFromWebhook(reservation: any) {
    try {
      if (!reservation?.folio) {
        return;
      }

      if (!reservation.email) {
        await this.prisma.reservationTrace.create({
          data: {
            reservationId: reservation.id,
            folio: reservation.folio,
            step: 'PAID_EMAIL_SKIPPED',
            message: 'Reserva pagada sin email de cliente',
            metadata: {
              reason: 'missing_customer_email',
            },
          },
        });

        return;
      }

      const alreadySent = await this.prisma.reservationEmailLog.findFirst({
        where: {
          folio: reservation.folio,
          type: 'CUSTOMER_RESERVATION_PAID',
          status: 'SENT',
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (alreadySent) {
        await this.prisma.reservationTrace.create({
          data: {
            reservationId: reservation.id,
            folio: reservation.folio,
            step: 'PAID_EMAIL_ALREADY_SENT',
            message: 'Correo de reserva pagada ya había sido enviado',
            metadata: {
              emailLogId: alreadySent.id,
              sentAt: alreadySent.createdAt,
            },
          },
        });

        return;
      }

      const emailResult =
        await this.reservationMailService.sendReservationPaidEmails(reservation);

      await this.prisma.reservationTrace.create({
        data: {
          reservationId: reservation.id,
          folio: reservation.folio,
          step: 'PAID_EMAIL_SENT_FROM_WEBHOOK',
          message: 'Correo de reserva pagada enviado automáticamente desde webhook',
          metadata: emailResult as any,
        },
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Error enviando correo automático de reserva pagada para ${reservation?.folio}: ${message}`,
      );

      if (reservation?.id && reservation?.folio) {
        await this.prisma.reservationTrace.create({
          data: {
            reservationId: reservation.id,
            folio: reservation.folio,
            step: 'PAID_EMAIL_FAILED_FROM_WEBHOOK',
            message: 'Falló el envío automático del correo desde webhook',
            metadata: {
              error: message,
            },
          },
        });
      }
    }
  }

  private async syncReservationToGoogleCalendar(folio: string) {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { folio },
        include: {
          extras: true,
          payments: true,
          package: {
            include: this.packageEmailInclude,
          },
        },
      });

      if (!reservation) {
        return;
      }

      await this.googleCalendarService.upsertReservationEvent(reservation);
    } catch (error: any) {
      this.logger.error(
        `Error al sincronizar la reservación ${folio} con Google Calendar: ${error.message}`,
      );
    }
  }

  private async findPaymentIntentByFolio(
    folio: string,
  ): Promise<Stripe.PaymentIntent | null> {
    const paymentIntents = await this.stripe.paymentIntents.list({
      limit: 100,
    });

    const matches = paymentIntents.data
      .filter(
        (intent) => intent.metadata?.folio?.trim().toUpperCase() === folio,
      )
      .sort((a, b) => b.created - a.created);

    return matches[0] ?? null;
  }

  private async findActiveOxxoPaymentIntentByFolio(
    folio: string,
  ): Promise<Stripe.PaymentIntent | null> {
    const paymentIntents = await this.stripe.paymentIntents.list({
      limit: 100,
    });

    const matches = paymentIntents.data
      .filter((intent) => {
        const sameFolio =
          intent.metadata?.folio?.trim().toUpperCase() === folio;

        const isOxxo =
          intent.payment_method_types?.includes('oxxo') ||
          intent.metadata?.paymentType === 'oxxo';

        const activeStatuses = [
          'requires_action',
          'requires_payment_method',
          'processing',
        ];

        return sameFolio && isOxxo && activeStatuses.includes(intent.status);
      })
      .sort((a, b) => b.created - a.created);

    return matches[0] ?? null;
  }

  private getOxxoDisplayDetails(paymentIntent: Stripe.PaymentIntent): {
    hostedVoucherUrl: string | null;
    number: string | null;
    expiresAfter: number | null;
  } | null {
    const nextAction = paymentIntent.next_action;

    if (!nextAction || nextAction.type !== 'oxxo_display_details') {
      return null;
    }

    const details = nextAction.oxxo_display_details;

    return {
      hostedVoucherUrl: details?.hosted_voucher_url ?? null,
      number: details?.number ?? null,
      expiresAfter: details?.expires_after ?? null,
    };
  }

  private getChargeIdFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
  ): string | null {
    const charge = paymentIntent.latest_charge;

    if (typeof charge === 'string' && charge.trim()) {
      return charge;
    }

    return null;
  }

  private getFolioFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
  ): string | null {
    const folio = paymentIntent.metadata?.folio;

    if (!folio || typeof folio !== 'string') {
      return null;
    }

    return folio.trim().toUpperCase();
  }

  private mapReservationStatus(status: string) {
    switch (status) {
      case 'PAID':
        return {
          code: 'paid',
          message: 'La reservación ya fue pagada correctamente',
        };

      case 'PROCESSING_PAYMENT':
        return {
          code: 'processing',
          message: 'El pago está en proceso de confirmación',
        };

      case 'PAYMENT_FAILED':
        return {
          code: 'failed',
          message: 'El pago falló',
        };

      case 'CANCELED':
        return {
          code: 'canceled',
          message: 'El pago fue cancelado',
        };

      case 'DRAFT':
      default:
        return {
          code: 'pending',
          message: 'La reservación aún no ha sido pagada',
        };
    }
  }
}