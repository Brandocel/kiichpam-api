import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type LifecycleStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'PROCESSING'
  | 'FAILED'
  | 'WARNING'
  | 'SKIPPED';

type LifecycleSeverity = 'OK' | 'INFO' | 'WARNING' | 'ERROR';

type LifecycleStep = {
  order: number;
  key: string;
  title: string;
  status: LifecycleStatus;
  severity: LifecycleSeverity;
  message: string;
  timestamp: Date | null;
  expected: string;
  blocker: boolean;
  metadata?: any;
};

@Injectable()
export class ReservationLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async addTrace(params: {
    folio: string;
    step: string;
    message?: string;
    metadata?: any;
  }) {
    const normalizedFolio = params.folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      select: {
        id: true,
        folio: true,
      },
    });

    if (!reservation) {
      return null;
    }

    return this.prisma.reservationTrace.create({
      data: {
        reservationId: reservation.id,
        folio: reservation.folio,
        step: params.step,
        message: params.message ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  }

  async getLifecycleByFolio(folio: string) {
    const normalizedFolio = folio.trim().toUpperCase();

    const reservation = await this.prisma.reservation.findUnique({
      where: { folio: normalizedFolio },
      include: {
        extras: true,
        payments: true,
        traces: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        package: {
          include: {
            coverMedia: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const emailLogs = await this.prisma.reservationEmailLog.findMany({
      where: {
        folio: normalizedFolio,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const traces = reservation.traces ?? [];

    const latestTrace = (step: string) =>
      [...traces].reverse().find((trace) => trace.step === step) ?? null;

    const latestTraceStartsWith = (prefix: string) =>
      [...traces].reverse().find((trace) => trace.step.startsWith(prefix)) ??
      null;

    const hasTrace = (step: string) =>
      traces.some((trace) => trace.step === step);

    const hasAnyTrace = (steps: string[]) =>
      steps.some((step) => hasTrace(step));

    const latestEmailLogByType = (type: string) =>
      [...emailLogs].reverse().find((log) => log.type === type) ?? null;

    const hasEmailLog = (type: string, status: string) =>
      emailLogs.some((log) => log.type === type && log.status === status);

    const latestCustomerEmailLog = latestEmailLogByType(
      'CUSTOMER_RESERVATION_PAID',
    );

    const latestOperationsEmailLog = latestEmailLogByType(
      'OPERATIONS_RESERVATION_PAID',
    );

    const customerEmailSent = hasEmailLog(
      'CUSTOMER_RESERVATION_PAID',
      'SENT',
    );

    const customerEmailFailed = hasEmailLog(
      'CUSTOMER_RESERVATION_PAID',
      'FAILED',
    );

    const operationsEmailSent = hasEmailLog(
      'OPERATIONS_RESERVATION_PAID',
      'SENT',
    );

    const operationsEmailFailed = hasEmailLog(
      'OPERATIONS_RESERVATION_PAID',
      'FAILED',
    );

    const hasOperationsEmailConfigured = Boolean(
      process.env.MAIL_OPERATIONS_EMAIL,
    );

    const stripeIntentCreated = hasAnyTrace([
      'STRIPE_PAYMENT_INTENT_CREATED',
      'STRIPE_OXXO_REFERENCE_CREATED',
    ]);

    const stripeSucceeded = hasAnyTrace([
      'STRIPE_PAYMENT_SUCCEEDED',
      'PAYMENT_CONFIRMED',
    ]);

    const stripeFailed = hasAnyTrace([
      'STRIPE_PAYMENT_FAILED',
      'STRIPE_PAYMENT_CANCELED',
      'STRIPE_PAYMENT_WEBHOOK_FAILED',
    ]);

    const calendarSynced = hasTrace('GOOGLE_CALENDAR_SYNCED');
    const calendarFailed = hasTrace('GOOGLE_CALENDAR_SYNC_FAILED');

    const paidEmailSentFromWebhook = hasTrace('PAID_EMAIL_SENT_FROM_WEBHOOK');
    const paidEmailFailedFromWebhook = hasTrace(
      'PAID_EMAIL_FAILED_FROM_WEBHOOK',
    );
    const paidEmailSkipped = hasTrace('PAID_EMAIL_SKIPPED');
    const paidEmailAlreadySent = hasTrace('PAID_EMAIL_ALREADY_SENT');

    const isPaid = reservation.status === 'PAID';
    const isProcessing = reservation.status === 'PROCESSING_PAYMENT';
    const isFailed = ['PAYMENT_FAILED', 'CANCELED'].includes(
      reservation.status,
    );

    const steps: LifecycleStep[] = [
      {
        order: 1,
        key: 'RESERVATION_CREATED',
        title: 'Reservación creada',
        status: 'COMPLETED',
        severity: 'OK',
        message: 'La reservación existe en base de datos.',
        timestamp: reservation.createdAt,
        expected: 'Debe existir un folio y una reservación guardada.',
        blocker: false,
        metadata: {
          id: reservation.id,
          folio: reservation.folio,
          status: reservation.status,
          packageCode: reservation.package?.code ?? null,
          totalMXN: reservation.totalMXN,
          currency: reservation.currency,
        },
      },
      {
        order: 2,
        key: 'QUOTE_RESOLVED',
        title: 'Cotización calculada',
        status: hasTrace('QUOTE_RESOLVED') ? 'COMPLETED' : 'WARNING',
        severity: hasTrace('QUOTE_RESOLVED') ? 'OK' : 'WARNING',
        message: hasTrace('QUOTE_RESOLVED')
          ? 'El backend calculó precio, campaña, cupón, extras y total.'
          : 'No se encontró trace de cotización. La reserva existe, pero falta evidencia del cálculo.',
        timestamp: latestTrace('QUOTE_RESOLVED')?.createdAt ?? null,
        expected:
          'Debe existir un trace QUOTE_RESOLVED cuando se crea la reservación.',
        blocker: !hasTrace('QUOTE_RESOLVED'),
        metadata: latestTrace('QUOTE_RESOLVED')?.metadata ?? null,
      },
      {
        order: 3,
        key: 'CUSTOMER_CONTACT',
        title: 'Datos del cliente',
        status: reservation.email ? 'COMPLETED' : 'WARNING',
        severity: reservation.email ? 'OK' : 'WARNING',
        message: reservation.email
          ? 'La reservación tiene correo del cliente.'
          : 'La reservación no tiene email. No se podrá mandar confirmación automática al cliente.',
        timestamp: reservation.updatedAt,
        expected:
          'Para correo automático debe existir email del cliente en la reservación.',
        blocker: !reservation.email,
        metadata: {
          firstName: reservation.firstName,
          lastName: reservation.lastName,
          email: reservation.email,
          phone: reservation.phone,
          country: reservation.country,
        },
      },
      {
        order: 4,
        key: 'STRIPE_PAYMENT_CREATED',
        title: 'Pago creado en Stripe',
        status:
          stripeIntentCreated || isProcessing || isPaid || isFailed
            ? 'COMPLETED'
            : 'PENDING',
        severity:
          stripeIntentCreated || isProcessing || isPaid || isFailed
            ? 'OK'
            : 'INFO',
        message:
          stripeIntentCreated || isProcessing || isPaid || isFailed
            ? 'Se detectó que el flujo de pago inició.'
            : 'Todavía no hay evidencia de un PaymentIntent o referencia OXXO.',
        timestamp:
          latestTrace('STRIPE_PAYMENT_INTENT_CREATED')?.createdAt ??
          latestTrace('STRIPE_OXXO_REFERENCE_CREATED')?.createdAt ??
          null,
        expected:
          'Al llamar /payments/intent o /payments/oxxo-reference debe registrarse trace del intento.',
        blocker: false,
        metadata:
          latestTrace('STRIPE_PAYMENT_INTENT_CREATED')?.metadata ??
          latestTrace('STRIPE_OXXO_REFERENCE_CREATED')?.metadata ??
          null,
      },
      {
        order: 5,
        key: 'STRIPE_WEBHOOK',
        title: 'Confirmación de Stripe',
        status: stripeSucceeded
          ? 'COMPLETED'
          : stripeFailed || isFailed
            ? 'FAILED'
            : isProcessing
              ? 'PROCESSING'
              : 'PENDING',
        severity: stripeSucceeded
          ? 'OK'
          : stripeFailed || isFailed
            ? 'ERROR'
            : isProcessing
              ? 'INFO'
              : 'INFO',
        message: stripeSucceeded
          ? 'Stripe confirmó el pago correctamente.'
          : stripeFailed || isFailed
            ? `Stripe reportó fallo o cancelación. Estado actual: ${reservation.status}.`
            : isProcessing
              ? 'El pago está en proceso. Puede ser normal en OXXO o métodos asincrónicos.'
              : 'Stripe todavía no ha confirmado el pago.',
        timestamp:
          latestTrace('STRIPE_PAYMENT_SUCCEEDED')?.createdAt ??
          latestTrace('PAYMENT_CONFIRMED')?.createdAt ??
          latestTrace('STRIPE_PAYMENT_FAILED')?.createdAt ??
          latestTrace('STRIPE_PAYMENT_CANCELED')?.createdAt ??
          latestTrace('STRIPE_PAYMENT_WEBHOOK_FAILED')?.createdAt ??
          null,
        expected:
          'Stripe debe mandar webhook y el backend debe cambiar la reservación a PAID, PAYMENT_FAILED, PROCESSING_PAYMENT o CANCELED.',
        blocker: !stripeSucceeded && (stripeFailed || isFailed),
        metadata: {
          reservationStatus: reservation.status,
          successTrace:
            latestTrace('STRIPE_PAYMENT_SUCCEEDED') ??
            latestTrace('PAYMENT_CONFIRMED'),
          failedTrace:
            latestTrace('STRIPE_PAYMENT_FAILED') ??
            latestTrace('STRIPE_PAYMENT_CANCELED') ??
            latestTrace('STRIPE_PAYMENT_WEBHOOK_FAILED'),
        },
      },
      {
        order: 6,
        key: 'RESERVATION_PAID',
        title: 'Reservación pagada',
        status: isPaid
          ? 'COMPLETED'
          : isFailed
            ? 'FAILED'
            : isProcessing
              ? 'PROCESSING'
              : 'PENDING',
        severity: isPaid
          ? 'OK'
          : isFailed
            ? 'ERROR'
            : isProcessing
              ? 'INFO'
              : 'INFO',
        message: isPaid
          ? 'La reservación está marcada como PAID.'
          : isFailed
            ? `La reservación terminó con estado ${reservation.status}.`
            : isProcessing
              ? 'La reservación está esperando confirmación del pago.'
              : 'La reservación aún no está pagada.',
        timestamp: reservation.updatedAt,
        expected:
          'Después de payment_intent.succeeded la reservación debe quedar en PAID.',
        blocker: isFailed,
        metadata: {
          status: reservation.status,
        },
      },
      {
        order: 7,
        key: 'GOOGLE_CALENDAR',
        title: 'Google Calendar',
        status: calendarSynced
          ? 'COMPLETED'
          : calendarFailed
            ? 'FAILED'
            : isPaid
              ? 'WARNING'
              : 'PENDING',
        severity: calendarSynced
          ? 'OK'
          : calendarFailed
            ? 'ERROR'
            : isPaid
              ? 'WARNING'
              : 'INFO',
        message: calendarSynced
          ? 'La reservación fue sincronizada con Google Calendar.'
          : calendarFailed
            ? 'Falló la sincronización con Google Calendar.'
            : isPaid
              ? 'La reservación está pagada, pero no hay evidencia de sincronización en Google Calendar.'
              : 'Google Calendar se sincroniza después de confirmar el pago.',
        timestamp:
          latestTrace('GOOGLE_CALENDAR_SYNCED')?.createdAt ??
          latestTrace('GOOGLE_CALENDAR_SYNC_FAILED')?.createdAt ??
          null,
        expected:
          'Después de PAID debe crearse o actualizarse el evento en Google Calendar.',
        blocker: isPaid && !calendarSynced,
        metadata:
          latestTrace('GOOGLE_CALENDAR_SYNCED')?.metadata ??
          latestTrace('GOOGLE_CALENDAR_SYNC_FAILED')?.metadata ??
          null,
      },
      {
        order: 8,
        key: 'CUSTOMER_EMAIL',
        title: 'Correo al cliente',
        status: customerEmailSent
          ? 'COMPLETED'
          : customerEmailFailed || paidEmailFailedFromWebhook
            ? 'FAILED'
            : paidEmailSkipped || !reservation.email
              ? 'SKIPPED'
              : isPaid
                ? 'WARNING'
                : 'PENDING',
        severity: customerEmailSent
          ? 'OK'
          : customerEmailFailed || paidEmailFailedFromWebhook
            ? 'ERROR'
            : paidEmailSkipped || !reservation.email
              ? 'WARNING'
              : isPaid
                ? 'WARNING'
                : 'INFO',
        message: customerEmailSent
          ? 'El correo de confirmación fue enviado al cliente.'
          : customerEmailFailed || paidEmailFailedFromWebhook
            ? 'Falló el envío del correo al cliente.'
            : paidEmailSkipped || !reservation.email
              ? 'El correo al cliente fue omitido porque falta email.'
              : isPaid
                ? 'La reserva está pagada, pero no hay registro de correo enviado al cliente.'
                : 'El correo al cliente se manda después del pago.',
        timestamp:
          latestCustomerEmailLog?.createdAt ??
          latestTrace('PAID_EMAIL_FAILED_FROM_WEBHOOK')?.createdAt ??
          latestTrace('PAID_EMAIL_SKIPPED')?.createdAt ??
          null,
        expected:
          'Después de PAID debe enviarse correo de confirmación al cliente.',
        blocker:
          isPaid &&
          !customerEmailSent &&
          !paidEmailAlreadySent &&
          !paidEmailSkipped,
        metadata: {
          latestEmailLog: latestCustomerEmailLog,
          paidEmailSentFromWebhook,
          paidEmailFailedFromWebhook,
          paidEmailSkipped,
          paidEmailAlreadySent,
        },
      },
      {
        order: 9,
        key: 'OPERATIONS_EMAIL',
        title: 'Correo a operaciones',
        status: operationsEmailSent
          ? 'COMPLETED'
          : operationsEmailFailed
            ? 'FAILED'
            : !hasOperationsEmailConfigured
              ? 'SKIPPED'
              : isPaid
                ? 'WARNING'
                : 'PENDING',
        severity: operationsEmailSent
          ? 'OK'
          : operationsEmailFailed
            ? 'ERROR'
            : !hasOperationsEmailConfigured
              ? 'WARNING'
              : isPaid
                ? 'WARNING'
                : 'INFO',
        message: operationsEmailSent
          ? 'El correo operativo fue enviado correctamente.'
          : operationsEmailFailed
            ? 'Falló el correo a operaciones.'
            : !hasOperationsEmailConfigured
              ? 'No hay MAIL_OPERATIONS_EMAIL configurado.'
              : isPaid
                ? 'La reserva está pagada, pero no hay registro de correo enviado a operaciones.'
                : 'El correo a operaciones se manda después del pago.',
        timestamp: latestOperationsEmailLog?.createdAt ?? null,
        expected:
          'Después de PAID debe enviarse correo interno a operaciones si MAIL_OPERATIONS_EMAIL existe.',
        blocker:
          isPaid && hasOperationsEmailConfigured && !operationsEmailSent,
        metadata: {
          latestEmailLog: latestOperationsEmailLog,
          hasOperationsEmailConfigured,
        },
      },
    ];

    const blockers = steps.filter((step) => step.blocker);
    const failedSteps = steps.filter((step) => step.status === 'FAILED');
    const warningSteps = steps.filter((step) => step.status === 'WARNING');
    const pendingSteps = steps.filter(
      (step) => step.status === 'PENDING' || step.status === 'PROCESSING',
    );

    const completed = steps.filter((step) => step.status === 'COMPLETED').length;
    const failed = failedSteps.length;
    const warnings = warningSteps.length;
    const skipped = steps.filter((step) => step.status === 'SKIPPED').length;

    const flowHealthy = blockers.length === 0 && failed === 0;

    return {
      success: true,
      message: flowHealthy
        ? 'La línea de vida no presenta bloqueos críticos.'
        : 'La línea de vida tiene bloqueos o advertencias que requieren revisión.',
      folio: reservation.folio,
      reservationStatus: reservation.status,
      flowHealthy,
      currentBlocker:
        blockers[0] ?? failedSteps[0] ?? warningSteps[0] ?? pendingSteps[0] ?? null,
      blockers,
      progress: {
        totalSteps: steps.length,
        completed,
        failed,
        warnings,
        skipped,
        percentage: Math.round((completed / steps.length) * 100),
      },
      summary: {
        isPaid,
        isProcessing,
        isFailed,
        hasCustomerEmail: Boolean(reservation.email),
        stripeIntentCreated,
        stripeSucceeded,
        stripeFailed,
        calendarSynced,
        calendarFailed,
        customerEmailSent,
        customerEmailFailed,
        operationsEmailSent,
        operationsEmailFailed,
        hasOperationsEmailConfigured,
      },
      reservation: {
        id: reservation.id,
        folio: reservation.folio,
        status: reservation.status,
        packageCode: reservation.package?.code ?? null,
        visitDate: reservation.visitDate,
        totalMXN: reservation.totalMXN,
        currency: reservation.currency,
        customer: {
          firstName: reservation.firstName,
          lastName: reservation.lastName,
          email: reservation.email,
          phone: reservation.phone,
          country: reservation.country,
        },
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
      },
      steps,
      raw: {
        traces,
        emailLogs,
        payments: reservation.payments,
        extras: reservation.extras,
      },
    };
  }
}