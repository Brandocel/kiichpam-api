import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';

type Lang = 'es' | 'en';

@Injectable()
export class ReservationMailService {
  private readonly resend: Resend;

  private readonly whatsappNumber = '529987510867';
  private readonly whatsappDisplay = '+52 998 751 0867';
  private readonly brandName = 'Kiichpam Xunáan';
  private readonly timezone = 'America/Cancun';

  constructor(private readonly prisma: PrismaService) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required');
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendReservationPaidEmails(reservation: any) {
    if (!reservation?.id || !reservation?.folio) {
      throw new BadRequestException('Reserva inválida para enviar correo');
    }

    if (!reservation.email) {
      throw new BadRequestException('La reserva no tiene correo del cliente');
    }

    const normalizedReservation = this.normalizeReservation(reservation);

    const customerResult = await this.sendCustomerEmail(normalizedReservation);

    let operationsResult: any = null;

    if (process.env.MAIL_OPERATIONS_EMAIL) {
      operationsResult = await this.sendOperationsEmail(normalizedReservation);
    }

    await this.prisma.reservationTrace.create({
      data: {
        reservationId: normalizedReservation.id,
        folio: normalizedReservation.folio,
        step: 'RESERVATION_EMAILS_PROCESSED',
        message: 'Correos de reserva pagada procesados',
        metadata: {
          customerResult,
          operationsResult,
        },
      },
    });

    return {
      success: true,
      message: 'Correos procesados correctamente',
      customer: customerResult,
      operations: operationsResult,
    };
  }

  async getEmailStatusByFolio(folio: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
      select: {
        id: true,
        folio: true,
        status: true,
        email: true,
      },
    });

    if (!reservation) {
      throw new BadRequestException('Reserva no encontrada');
    }

    const logs = await this.prisma.reservationEmailLog.findMany({
      where: { folio },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const customerEmailSent = logs.some(
      (log) =>
        log.type === 'CUSTOMER_RESERVATION_PAID' && log.status === 'SENT',
    );

    const operationsEmailSent = logs.some(
      (log) =>
        log.type === 'OPERATIONS_RESERVATION_PAID' && log.status === 'SENT',
    );

    return {
      folio,
      reservationStatus: reservation.status,
      customerEmail: reservation.email,
      customerEmailSent,
      operationsEmailSent,
      totalAttempts: logs.length,
      logs,
    };
  }

  private async sendCustomerEmail(reservation: any) {
    const lang: Lang = reservation.snapshotLang === 'en' ? 'en' : 'es';

    const customerName =
      `${reservation.firstName ?? ''} ${reservation.lastName ?? ''}`.trim() ||
      (lang === 'en' ? 'Customer' : 'Cliente');

    const subject =
      lang === 'en'
        ? `Reservation confirmed - ${reservation.folio}`
        : `Reserva confirmada - ${reservation.folio}`;

    const html =
      lang === 'en'
        ? this.customerTemplateEn(reservation, customerName)
        : this.customerTemplateEs(reservation, customerName);

    return this.sendAndLog({
      reservation,
      type: 'CUSTOMER_RESERVATION_PAID',
      to: reservation.email,
      subject,
      html,
    });
  }

  private async sendOperationsEmail(reservation: any) {
    const customerName =
      `${reservation.firstName ?? ''} ${reservation.lastName ?? ''}`.trim() ||
      'Cliente';

    const subject = `Reserva pagada para taquilla - ${reservation.folio}`;

    const html = this.operationsTemplate(reservation, customerName);

    return this.sendAndLog({
      reservation,
      type: 'OPERATIONS_RESERVATION_PAID',
      to: process.env.MAIL_OPERATIONS_EMAIL!,
      subject,
      html,
    });
  }

  private async sendAndLog(params: {
    reservation: any;
    type: string;
    to: string;
    subject: string;
    html: string;
  }) {
    const from = process.env.MAIL_FROM;

    if (!from) {
      throw new BadRequestException('MAIL_FROM is required');
    }

    const log = await this.prisma.reservationEmailLog.create({
      data: {
        reservationId: params.reservation.id,
        folio: params.reservation.folio,
        type: params.type,
        to: params.to,
        subject: params.subject,
        status: 'PENDING',
        provider: 'RESEND',
      },
    });

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (error) {
        await this.prisma.reservationEmailLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            error: JSON.stringify(error),
            metadata: error as any,
          },
        });

        throw new InternalServerErrorException({
          message: 'Resend no pudo enviar el correo',
          error,
        });
      }

      const updatedLog = await this.prisma.reservationEmailLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          providerId: data?.id ?? null,
          metadata: data as any,
        },
      });

      return {
        success: true,
        status: 'SENT',
        type: params.type,
        to: params.to,
        providerId: data?.id ?? null,
        logId: updatedLog.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.reservationEmailLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          error: message,
        },
      });

      throw new InternalServerErrorException({
        message: 'Error enviando correo de reserva',
        error: message,
      });
    }
  }

  private customerTemplateEs(reservation: any, customerName: string) {
    return `
      ${this.emailWrapperStart('¡Reserva confirmada!', 'Tu reservación ha sido confirmada')}
        <p style="margin:0 0 16px 0;">Hola <strong>${this.escape(customerName)}</strong>,</p>

        <p style="margin:0 0 18px 0;">
          Tu pago fue recibido correctamente y tu reservación quedó confirmada.
        </p>

        ${this.alertBox(
          'Importante',
          'Presenta este correo en taquilla el día de tu visita. También puedes compartirlo por WhatsApp con Kiichpam Xunáan.',
        )}

        ${this.sectionTitle('Detalles de la reservación')}
        ${this.reservationDetailsTable(reservation, 'es')}

        ${this.sectionTitle('Información del cliente')}
        ${this.customerInfoTable(reservation, customerName, 'es')}

        ${this.sectionTitle('Método de pago')}
        ${this.paymentTable(reservation, 'es')}

        ${this.sectionTitle('Campaña y descuentos')}
        ${this.discountsTable(reservation, 'es')}

        ${this.sectionTitle('Incluye')}
        ${this.listBox(this.getInclusions(reservation), 'No hay inclusiones registradas')}

        ${this.sectionTitle('No incluye')}
        ${this.listBox(this.getExclusions(reservation), 'No hay exclusiones registradas')}

        ${this.whatsappBox('es')}

        <p style="margin-top:24px;">
          Gracias por reservar con <strong>${this.brandName}</strong>.
        </p>
      ${this.emailWrapperEnd()}
    `;
  }

  private customerTemplateEn(reservation: any, customerName: string) {
    return `
      ${this.emailWrapperStart('Reservation confirmed!', 'Your reservation has been confirmed')}
        <p style="margin:0 0 16px 0;">Hello <strong>${this.escape(customerName)}</strong>,</p>

        <p style="margin:0 0 18px 0;">
          Your payment was received successfully and your reservation is confirmed.
        </p>

        ${this.alertBox(
          'Important',
          'Please show this email at the ticket office on the day of your visit. You can also share it via WhatsApp with Kiichpam Xunáan.',
        )}

        ${this.sectionTitle('Reservation details')}
        ${this.reservationDetailsTable(reservation, 'en')}

        ${this.sectionTitle('Customer information')}
        ${this.customerInfoTable(reservation, customerName, 'en')}

        ${this.sectionTitle('Payment method')}
        ${this.paymentTable(reservation, 'en')}

        ${this.sectionTitle('Campaign and discounts')}
        ${this.discountsTable(reservation, 'en')}

        ${this.sectionTitle('Includes')}
        ${this.listBox(this.getInclusions(reservation), 'No inclusions registered')}

        ${this.sectionTitle('Not included')}
        ${this.listBox(this.getExclusions(reservation), 'No exclusions registered')}

        ${this.whatsappBox('en')}

        <p style="margin-top:24px;">
          Thank you for booking with <strong>${this.brandName}</strong>.
        </p>
      ${this.emailWrapperEnd()}
    `;
  }

  private operationsTemplate(reservation: any, customerName: string) {
    return `
      ${this.emailWrapperStart('Reserva pagada para taquilla', `Folio: ${this.escape(reservation.folio)}`)}
        ${this.alertBox(
          'Acción requerida en taquilla',
          'Validar el correo del cliente, confirmar el folio, revisar campaña aplicada, método de pago y datos de acceso antes de permitir el ingreso.',
        )}

        ${this.sectionTitle('Cliente')}
        ${this.customerInfoTable(reservation, customerName, 'es')}

        ${this.sectionTitle('Detalles de la reservación')}
        ${this.reservationDetailsTable(reservation, 'es')}

        ${this.sectionTitle('Método de pago')}
        ${this.paymentTable(reservation, 'es')}

        ${this.sectionTitle('Campaña y descuentos')}
        ${this.discountsTable(reservation, 'es')}

        ${this.sectionTitle('Incluye')}
        ${this.listBox(this.getInclusions(reservation), 'No hay inclusiones registradas')}

        ${this.sectionTitle('No incluye')}
        ${this.listBox(this.getExclusions(reservation), 'No hay exclusiones registradas')}

        ${this.sectionTitle('Notas para taquilla')}
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb;">
          <ul style="margin:0; padding-left:20px;">
            <li>Confirmar que el folio coincida con la reservación.</li>
            <li>Solicitar al cliente que muestre este correo.</li>
            <li>Verificar que la reservación esté pagada.</li>
            <li>Revisar adultos, niños, infantes e INAPAM.</li>
            <li>Validar campaña, cupón y descuentos aplicados.</li>
            <li>Si hay dudas, contactar a administración por WhatsApp: ${this.whatsappDisplay}.</li>
          </ul>
        </div>
      ${this.emailWrapperEnd()}
    `;
  }

  private reservationDetailsTable(reservation: any, lang: Lang) {
    const labels =
      lang === 'en'
        ? {
            folio: 'Folio',
            package: 'Package',
            visitDate: 'Visit date',
            adults: 'Adults',
            children: 'Children',
            infants: 'Infants',
            inapam: 'INAPAM',
            comments: 'Comments',
            status: 'Reservation status',
            none: 'None',
          }
        : {
            folio: 'Folio',
            package: 'Paquete',
            visitDate: 'Fecha de visita',
            adults: 'Adultos',
            children: 'Niños',
            infants: 'Infantes',
            inapam: 'INAPAM',
            comments: 'Comentarios',
            status: 'Estado de la reservación',
            none: 'Ninguno',
          };

    const visitDate = this.formatDate(reservation.visitDate, lang);

    return `
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        ${this.row(labels.folio, this.escape(reservation.folio ?? labels.none))}
        ${this.row(labels.package, this.escape(this.getPackageName(reservation, lang)))}
        ${this.row(labels.visitDate, this.escape(visitDate))}
        ${this.row(labels.adults, this.escape(String(reservation.adults ?? 0)))}
        ${this.row(labels.children, this.escape(String(reservation.children ?? 0)))}
        ${this.row(labels.infants, this.escape(String(reservation.infants ?? 0)))}
        ${this.row(labels.inapam, this.escape(String(reservation.inapam ?? reservation.inapamQty ?? 0)))}
        ${this.row(labels.comments, this.escape(reservation.comments ?? labels.none))}
        ${this.row(labels.status, this.escape(reservation.status ?? labels.none))}
      </table>
    `;
  }

  private customerInfoTable(reservation: any, customerName: string, lang: Lang) {
    const labels =
      lang === 'en'
        ? {
            name: 'Name',
            email: 'Email',
            phone: 'Phone',
            country: 'Country',
            none: 'Not registered',
          }
        : {
            name: 'Nombre',
            email: 'Correo',
            phone: 'Teléfono',
            country: 'País',
            none: 'No registrado',
          };

    return `
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        ${this.row(labels.name, this.escape(customerName || labels.none))}
        ${this.row(labels.email, this.escape(reservation.email ?? labels.none))}
        ${this.row(labels.phone, this.escape(reservation.phone ?? labels.none))}
        ${this.row(labels.country, this.escape(reservation.country ?? labels.none))}
      </table>
    `;
  }

  private paymentTable(reservation: any, lang: Lang) {
    const labels =
      lang === 'en'
        ? {
            paymentMethod: 'Payment method',
            subtotal: 'Subtotal',
            campaignDiscount: 'Campaign discount',
            couponDiscount: 'Coupon discount',
            inapamDiscount: 'INAPAM discount',
            total: 'Total paid',
            currency: 'Currency',
            none: 'None',
          }
        : {
            paymentMethod: 'Método de pago',
            subtotal: 'Subtotal',
            campaignDiscount: 'Descuento de campaña',
            couponDiscount: 'Descuento de cupón',
            inapamDiscount: 'Descuento INAPAM',
            total: 'Total pagado',
            currency: 'Moneda',
            none: 'Ninguno',
          };

    const currency = reservation.currency ?? 'MXN';

    return `
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        ${this.row(labels.paymentMethod, this.escape(this.getPaymentMethod(reservation, lang)))}
        ${this.row(labels.subtotal, this.money(reservation.subtotalMXN, currency))}
        ${this.row(labels.campaignDiscount, `-${this.money(reservation.campaignDiscountMXN, currency)}`)}
        ${this.row(labels.couponDiscount, `-${this.money(reservation.couponDiscountMXN, currency)}`)}
        ${this.row(labels.inapamDiscount, `-${this.money(reservation.inapamDiscountMXN, currency)}`)}
        ${this.row(labels.total, `<strong style="font-size:18px;color:#00586F;">${this.money(reservation.totalMXN, currency)}</strong>`)}
        ${this.row(labels.currency, this.escape(currency))}
      </table>
    `;
  }

  private discountsTable(reservation: any, lang: Lang) {
    const labels =
      lang === 'en'
        ? {
            campaign: 'Applied campaign',
            campaignCode: 'Campaign code',
            coupon: 'Coupon',
            none: 'None',
            campaignDiscount: 'Campaign discount',
            couponDiscount: 'Coupon discount',
            inapamDiscount: 'INAPAM discount',
          }
        : {
            campaign: 'Campaña aplicada',
            campaignCode: 'Código de campaña',
            coupon: 'Cupón',
            none: 'Ninguno',
            campaignDiscount: 'Descuento por campaña',
            couponDiscount: 'Descuento por cupón',
            inapamDiscount: 'Descuento INAPAM',
          };

    const currency = reservation.currency ?? 'MXN';

    return `
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
        ${this.row(labels.campaign, this.escape(this.getCampaignName(reservation, labels.none)))}
        ${this.row(labels.campaignCode, this.escape(this.getCampaignCode(reservation, labels.none)))}
        ${this.row(labels.campaignDiscount, `-${this.money(reservation.campaignDiscountMXN, currency)}`)}
        ${this.row(labels.coupon, this.escape(reservation.couponCode ?? labels.none))}
        ${this.row(labels.couponDiscount, `-${this.money(reservation.couponDiscountMXN, currency)}`)}
        ${this.row(labels.inapamDiscount, `-${this.money(reservation.inapamDiscountMXN, currency)}`)}
      </table>
    `;
  }

  private row(label: string, value: string) {
    return `
      <tr>
        <td style="border:1px solid #e5e7eb; padding:11px 12px; background:#f9fafb; font-weight:bold; width:38%; color:#00586F;">
          ${label}
        </td>
        <td style="border:1px solid #e5e7eb; padding:11px 12px; color:#111827;">
          ${value}
        </td>
      </tr>
    `;
  }

  private sectionTitle(title: string) {
    return `
      <h2 style="font-size:18px; color:#00586F; margin:28px 0 10px 0; padding-bottom:8px; border-bottom:2px solid #C026D3;">
        ${this.escape(title)}
      </h2>
    `;
  }

  private alertBox(title: string, message: string) {
    return `
      <div style="background:#FDF4FF; border:1px solid #F0ABFC; border-left:5px solid #C026D3; padding:14px 16px; border-radius:10px; margin:18px 0;">
        <strong style="color:#86198F;">${this.escape(title)}:</strong>
        <span style="color:#374151;">${this.escape(message)}</span>
      </div>
    `;
  }

  private listBox(items: string[], emptyText: string) {
    if (!items || items.length === 0) {
      return `
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px 16px; background:#f9fafb;">
          ${this.escape(emptyText)}
        </div>
      `;
    }

    return `
      <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px 16px; background:#f9fafb;">
        <ul style="margin:0; padding-left:20px;">
          ${items.map((item) => `<li>${this.escape(item)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  private whatsappBox(lang: Lang) {
    const text =
      lang === 'en'
        ? 'Share or contact Kiichpam Xunáan via WhatsApp'
        : 'Comparte o contacta a Kiichpam Xunáan por WhatsApp';

    const button =
      lang === 'en' ? 'Contact by WhatsApp' : 'Contactar por WhatsApp';

    return `
      <div style="text-align:center; margin-top:30px; padding:20px; background:#ECFDF5; border:1px solid #A7F3D0; border-radius:14px;">
        <p style="margin:0 0 14px 0; color:#065F46; font-weight:bold;">
          ${this.escape(text)}
        </p>

        <p style="margin:0 0 16px 0; color:#111827;">
          ${this.whatsappDisplay}
        </p>

        <a href="https://wa.me/${this.whatsappNumber}"
           style="display:inline-block; background:#25D366; color:white; padding:12px 22px; border-radius:999px; text-decoration:none; font-weight:bold;">
          ${this.escape(button)}
        </a>
      </div>
    `;
  }

  private emailWrapperStart(title: string, subtitle: string) {
    return `
      <div style="font-family:Arial, Helvetica, sans-serif; max-width:760px; margin:0 auto; color:#111827; background:#ffffff;">
        <div style="background:#00586F; color:#ffffff; padding:28px 26px; border-radius:16px 16px 0 0;">
          <div style="font-size:13px; letter-spacing:1px; text-transform:uppercase; opacity:.9;">
            ${this.brandName}
          </div>
          <h1 style="margin:8px 0 4px 0; font-size:28px; line-height:1.2;">
            ${this.escape(title)}
          </h1>
          <p style="margin:0; font-size:15px; opacity:.95;">
            ${this.escape(subtitle)}
          </p>
        </div>

        <div style="border:1px solid #e5e7eb; border-top:0; padding:26px; border-radius:0 0 16px 16px;">
    `;
  }

  private emailWrapperEnd() {
    return `
          <div style="margin-top:30px; padding-top:18px; border-top:1px solid #e5e7eb; color:#6B7280; font-size:12px; line-height:1.5;">
            Este correo fue generado automáticamente por el sistema de reservaciones de ${this.brandName}.
          </div>
        </div>
      </div>
    `;
  }

  private normalizeReservation(reservation: any) {
    return {
      ...reservation,
      adults: Number(reservation.adults ?? 0),
      children: Number(reservation.children ?? 0),
      infants: Number(reservation.infants ?? 0),
      inapam: Number(reservation.inapam ?? reservation.inapamQty ?? 0),
      subtotalMXN: Number(reservation.subtotalMXN ?? 0),
      totalMXN: Number(reservation.totalMXN ?? 0),
      campaignDiscountMXN: Number(reservation.campaignDiscountMXN ?? 0),
      couponDiscountMXN: Number(reservation.couponDiscountMXN ?? 0),
      inapamDiscountMXN: Number(reservation.inapamDiscountMXN ?? 0),
      currency: reservation.currency ?? 'MXN',
    };
  }

  private getPackageName(reservation: any, lang: Lang) {
    if (lang === 'en') {
      return (
        reservation.snapshotNameEn ??
        reservation.snapshotName ??
        reservation.package?.nameEn ??
        reservation.package?.name ??
        reservation.package?.code ??
        'Package'
      );
    }

    return (
      reservation.snapshotName ??
      reservation.package?.name ??
      reservation.package?.code ??
      'Paquete'
    );
  }

  private getCampaignName(reservation: any, fallback: string) {
    return (
      reservation.campaignName ??
      reservation.snapshotCampaignName ??
      reservation.campaign?.name ??
      reservation.campaign?.title ??
      fallback
    );
  }

  private getCampaignCode(reservation: any, fallback: string) {
    return (
      reservation.campaignCode ??
      reservation.snapshotCampaignCode ??
      reservation.campaign?.code ??
      fallback
    );
  }

  private getPaymentMethod(reservation: any, lang: Lang) {
    const raw =
      reservation.paymentMethod ??
      reservation.paymentProvider ??
      reservation.payment?.method ??
      reservation.payment?.provider ??
      'STRIPE';

    const value = String(raw).toLowerCase();

    if (value.includes('stripe')) {
      return lang === 'en' ? 'Card payment by Stripe' : 'Pago con tarjeta por Stripe';
    }

    if (value.includes('cash') || value.includes('efectivo')) {
      return lang === 'en' ? 'Cash' : 'Efectivo';
    }

    if (value.includes('terminal')) {
      return lang === 'en' ? 'Card terminal' : 'Terminal bancaria';
    }

    if (value.includes('transfer')) {
      return lang === 'en' ? 'Bank transfer' : 'Transferencia bancaria';
    }

    return raw;
  }

  private getInclusions(reservation: any): string[] {
    const raw =
      reservation.snapshotPackageDetails?.inclusions ??
      reservation.snapshotInclusions ??
      reservation.package?.inclusions ??
      reservation.package?.includes ??
      reservation.inclusions ??
      [];

    return this.toStringArray(raw);
  }

  private getExclusions(reservation: any): string[] {
    const raw =
      reservation.snapshotPackageDetails?.exclusions ??
      reservation.snapshotExclusions ??
      reservation.package?.exclusions ??
      reservation.package?.notIncludes ??
      reservation.exclusions ??
      [];

    return this.toStringArray(raw);
  }

  private toStringArray(value: any): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item?.name) return item.name;
          if (item?.title) return item.title;
          if (item?.description) return item.description;
          return String(item);
        })
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter(Boolean);
        }

        return value
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean);
      } catch {
        return value
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    return [];
  }

  private formatDate(value: any, lang: Lang) {
    if (!value) {
      return lang === 'en' ? 'Not registered' : 'No registrada';
    }

    const locale = lang === 'en' ? 'en-US' : 'es-MX';

    try {
      return new Date(value).toLocaleString(locale, {
        timeZone: this.timezone,
        dateStyle: 'full',
        timeStyle: 'short',
      });
    } catch {
      return String(value);
    }
  }

  private money(value: any, currency = 'MXN') {
    const amount = Number(value ?? 0);

    return `$${amount.toFixed(2)} ${currency}`;
  }

  private escape(value: any) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}