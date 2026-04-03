import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY no está configurado');
    }

    this.stripe = new Stripe(secretKey);
  }

  private normalizeStripeAmountFromReservationTotal(rawAmount: unknown): {
    reservationTotalMXN: number;
    stripeAmount: number;
    detectedUnit: 'mxn' | 'centavos';
  } {
    const numericAmount = Number(rawAmount);
  
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Monto inválido para Stripe');
    }
  
    const hasDecimals = !Number.isInteger(numericAmount);
  
    /**
     * Reglas:
     * - Si tiene decimales, viene en MXN. Ej: 1035.00
     * - Si es entero y <= 10000, lo tratamos como MXN. Ej: 298
     * - Si es entero y > 10000, lo tratamos como centavos. Ej: 29800
     */
    if (hasDecimals || numericAmount <= 10000) {
      return {
        reservationTotalMXN: numericAmount,
        stripeAmount: Math.round(numericAmount * 100),
        detectedUnit: 'mxn',
      };
    }
  
    return {
      reservationTotalMXN: numericAmount / 100,
      stripeAmount: Math.round(numericAmount),
      detectedUnit: 'centavos',
    };
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
      totalMXN: Number(reservation.totalMXN),
      reservationId: reservation.id,
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
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
      totalMXN: Number(reservation.totalMXN),
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
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const rawTotal = Number(reservation.totalMXN);

    if (!Number.isFinite(rawTotal) || rawTotal <= 0) {
      throw new BadRequestException('La reservación no tiene un total válido');
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
    const normalizedAmount =
      this.normalizeStripeAmountFromReservationTotal(rawTotal);

    this.logger.log(
      `[CARD] folio=${reservation.folio} rawTotal=${rawTotal} detectedUnit=${normalizedAmount.detectedUnit} totalMXN=${normalizedAmount.reservationTotalMXN} stripeAmount=${normalizedAmount.stripeAmount}`,
    );

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: normalizedAmount.stripeAmount,
      currency,
      metadata: {
        folio: reservation.folio,
        reservationId: reservation.id,
        packageId: reservation.packageId,
        detectedUnit: normalizedAmount.detectedUnit,
      },
      description: `Pago de reservación ${reservation.folio}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    this.logger.log(
      `PaymentIntent creado: ${paymentIntent.id} para folio ${reservation.folio}`,
    );

    return this.buildCardResponse(reservation, paymentIntent, currency);
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
        package: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `No existe la reservación con folio ${normalizedFolio}`,
      );
    }

    const rawTotal = Number(reservation.totalMXN);

    if (!Number.isFinite(rawTotal) || rawTotal <= 0) {
      throw new BadRequestException('La reservación no tiene un total válido');
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

    const existingOxxoIntent = await this.findActiveOxxoPaymentIntentByFolio(
      normalizedFolio,
    );

    if (existingOxxoIntent) {
      await this.prisma.reservation.update({
        where: { folio: normalizedFolio },
        data: {
          status: 'PROCESSING_PAYMENT',
        },
      });

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

    const normalizedAmount =
      this.normalizeStripeAmountFromReservationTotal(rawTotal);

    this.logger.log(
      `[OXXO] folio=${reservation.folio} rawTotal=${rawTotal} detectedUnit=${normalizedAmount.detectedUnit} totalMXN=${normalizedAmount.reservationTotalMXN} stripeAmount=${normalizedAmount.stripeAmount}`,
    );

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: normalizedAmount.stripeAmount,
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
        detectedUnit: normalizedAmount.detectedUnit,
      },
      description: `Referencia OXXO de reservación ${reservation.folio}`,
    });

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
      `Referencia OXXO generada: ${paymentIntent.id} para folio ${reservation.folio}`,
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
          include: {
            coverMedia: true,
          },
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
      totalMXN: reservation.totalMXN,
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
          include: {
            coverMedia: true,
          },
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

    let newStatus = reservation.status;

    switch (paymentIntent.status) {
      case 'succeeded':
        newStatus = 'PAID';
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
        if (paymentIntent.payment_method_types?.includes('oxxo')) {
          newStatus = 'PROCESSING_PAYMENT';
        } else {
          newStatus = 'DRAFT';
        }
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
    });

    if (newStatus === 'PAID') {
      await this.syncReservationToGoogleCalendar(normalizedFolio);
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

    this.logger.log(
      `Refund creado: ${refund.id} para folio ${normalizedFolio}, charge=${chargeId}`,
    );

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
      note:
        'Si quieres marcar la reservación como REFUNDED en base de datos, primero confirma que ese estado existe en tu esquema Prisma.',
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

    const canceledIntent = await this.stripe.paymentIntents.cancel(paymentIntent.id);

    await this.prisma.reservation.update({
      where: { folio: normalizedFolio },
      data: {
        status: 'CANCELED',
      },
    });

    this.logger.warn(
      `PaymentIntent cancelado: ${canceledIntent.id} para folio ${normalizedFolio}`,
    );

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

    if (!rawBody || !(rawBody instanceof Buffer)) {
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

    this.logger.log(
      `payment_intent.succeeded recibido. intentId=${paymentIntent.id}, folio=${folio ?? 'N/A'}`,
    );

    if (!folio) {
      this.logger.warn(
        `No llegó folio en metadata para payment_intent.succeeded (${paymentIntent.id})`,
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
        status: 'PAID',
      },
    });

    this.logger.log(`Reservación ${folio} actualizada a PAID`);

    await this.syncReservationToGoogleCalendar(folio);
  }

  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    this.logger.warn(
      `payment_intent.payment_failed recibido. intentId=${paymentIntent.id}, folio=${folio ?? 'N/A'}`,
    );

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

    this.logger.log(`Reservación ${folio} actualizada a PAYMENT_FAILED`);
  }

  private async handlePaymentIntentProcessing(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    this.logger.log(
      `payment_intent.processing recibido. intentId=${paymentIntent.id}, folio=${folio ?? 'N/A'}`,
    );

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

    this.logger.log(`Reservación ${folio} actualizada a PROCESSING_PAYMENT`);
  }

  private async handlePaymentIntentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    this.logger.warn(
      `payment_intent.canceled recibido. intentId=${paymentIntent.id}, folio=${folio ?? 'N/A'}`,
    );

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

    this.logger.log(`Reservación ${folio} actualizada a CANCELED`);
  }

  private async handlePaymentIntentRequiresAction(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const folio = this.getFolioFromPaymentIntent(paymentIntent);

    this.logger.log(
      `payment_intent.requires_action recibido. intentId=${paymentIntent.id}, folio=${folio ?? 'N/A'}`,
    );

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

    this.logger.log(`Reservación ${folio} actualizada a PROCESSING_PAYMENT`);
  }

  private async syncReservationToGoogleCalendar(folio: string) {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { folio },
        include: {
          extras: true,
          payments: true,
          package: {
            include: {
              coverMedia: true,
            },
          },
        },
      });

      if (!reservation) {
        this.logger.warn(
          `No se encontró la reservación ${folio} para sincronizar a Google Calendar`,
        );
        return;
      }

      await this.googleCalendarService.upsertReservationEvent(reservation);

      this.logger.log(
        `Reservación ${folio} sincronizada correctamente con Google Calendar`,
      );
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
    const charges = paymentIntent.latest_charge;

    if (typeof charges === 'string' && charges.trim()) {
      return charges;
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

  private toStripeAmount(amountMXN: number): number {
    if (!Number.isFinite(amountMXN) || amountMXN <= 0) {
      throw new BadRequestException('Monto inválido para Stripe');
    }

    return Math.round(amountMXN * 100);
  }
}