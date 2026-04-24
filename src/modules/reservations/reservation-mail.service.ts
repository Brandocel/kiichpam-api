import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
  } from '@nestjs/common';
  import { Resend } from 'resend';
  import { PrismaService } from '../../prisma/prisma.service';
  
  @Injectable()
  export class ReservationMailService {
    private readonly resend: Resend;
  
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
  
      const customerResult = await this.sendCustomerEmail(reservation);
  
      let operationsResult: any = null;
  
      if (process.env.MAIL_OPERATIONS_EMAIL) {
        operationsResult = await this.sendOperationsEmail(reservation);
      }
  
      await this.prisma.reservationTrace.create({
        data: {
          reservationId: reservation.id,
          folio: reservation.folio,
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
      const lang = reservation.snapshotLang === 'en' ? 'en' : 'es';
  
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
  
      const subject = `Nueva reserva pagada - ${reservation.folio}`;
  
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
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: auto; color: #111827;">
          <div style="background: #00586F; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">¡Reserva confirmada!</h1>
          </div>
  
          <div style="border: 1px solid #e5e7eb; border-top: 0; padding: 24px; border-radius: 0 0 12px 12px;">
            <p>Hola <strong>${this.escape(customerName)}</strong>,</p>
  
            <p>Tu pago fue recibido correctamente y tu reserva quedó confirmada.</p>
  
            ${this.reservationDetailsTable(reservation, 'es')}
  
            <p style="margin-top: 24px;">
              Por favor conserva este correo como comprobante de tu reserva.
            </p>
  
            <p>Gracias por reservar con Kiichpam.</p>
          </div>
        </div>
      `;
    }
  
    private customerTemplateEn(reservation: any, customerName: string) {
      return `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: auto; color: #111827;">
          <div style="background: #00586F; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Reservation confirmed!</h1>
          </div>
  
          <div style="border: 1px solid #e5e7eb; border-top: 0; padding: 24px; border-radius: 0 0 12px 12px;">
            <p>Hello <strong>${this.escape(customerName)}</strong>,</p>
  
            <p>Your payment was received successfully and your reservation is confirmed.</p>
  
            ${this.reservationDetailsTable(reservation, 'en')}
  
            <p style="margin-top: 24px;">
              Please keep this email as your reservation receipt.
            </p>
  
            <p>Thank you for booking with Kiichpam.</p>
          </div>
        </div>
      `;
    }
  
    private operationsTemplate(reservation: any, customerName: string) {
      return `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: auto; color: #111827;">
          <div style="background: #00586F; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Nueva reserva pagada</h1>
          </div>
  
          <div style="border: 1px solid #e5e7eb; border-top: 0; padding: 24px; border-radius: 0 0 12px 12px;">
            <p>Se registró una reserva con pago aprobado.</p>
  
            <h3>Cliente</h3>
            <p><strong>Nombre:</strong> ${this.escape(customerName)}</p>
            <p><strong>Email:</strong> ${this.escape(reservation.email ?? 'No registrado')}</p>
            <p><strong>Teléfono:</strong> ${this.escape(reservation.phone ?? 'No registrado')}</p>
            <p><strong>País:</strong> ${this.escape(reservation.country ?? 'No registrado')}</p>
            <p><strong>Comentarios:</strong> ${this.escape(reservation.comments ?? 'Sin comentarios')}</p>
  
            ${this.reservationDetailsTable(reservation, 'es')}
          </div>
        </div>
      `;
    }
  
    private reservationDetailsTable(reservation: any, lang: 'es' | 'en') {
      const labels =
        lang === 'en'
          ? {
              folio: 'Folio',
              package: 'Package',
              visitDate: 'Visit date',
              adults: 'Adults',
              children: 'Children',
              infants: 'Infants',
              extras: 'Extras',
              subtotal: 'Subtotal',
              discounts: 'Discounts',
              total: 'Total paid',
              none: 'None',
            }
          : {
              folio: 'Folio',
              package: 'Paquete',
              visitDate: 'Fecha de visita',
              adults: 'Adultos',
              children: 'Niños',
              infants: 'Infantes',
              extras: 'Extras',
              subtotal: 'Subtotal',
              discounts: 'Descuentos',
              total: 'Total pagado',
              none: 'Ninguno',
            };
  
      const locale = lang === 'en' ? 'en-US' : 'es-MX';
  
      const visitDate = new Date(reservation.visitDate).toLocaleString(locale, {
        timeZone: 'America/Cancun',
        dateStyle: 'full',
        timeStyle: 'short',
      });
  
      const extrasText =
        reservation.extras && reservation.extras.length > 0
          ? reservation.extras
              .map(
                (extra: any) =>
                  `${this.escape(extra.name ?? extra.code)} x${extra.qty} - $${extra.priceMXN} ${extra.currency ?? 'MXN'}`,
              )
              .join('<br/>')
          : labels.none;
  
      const discountList = [
        reservation.campaignDiscountMXN > 0
          ? `Campaña: -$${reservation.campaignDiscountMXN} MXN`
          : null,
        reservation.couponDiscountMXN > 0
          ? `Cupón ${reservation.couponCode ?? ''}: -$${reservation.couponDiscountMXN} MXN`
          : null,
        reservation.inapamDiscountMXN > 0
          ? `INAPAM: -$${reservation.inapamDiscountMXN} MXN`
          : null,
      ].filter(Boolean);
  
      const discountsText =
        discountList.length > 0 ? discountList.join('<br/>') : labels.none;
  
      return `
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          ${this.row(labels.folio, reservation.folio)}
          ${this.row(labels.package, reservation.snapshotName ?? reservation.package?.code ?? 'Paquete')}
          ${this.row(labels.visitDate, visitDate)}
          ${this.row(labels.adults, String(reservation.adults))}
          ${this.row(labels.children, String(reservation.children))}
          ${this.row(labels.infants, String(reservation.infants))}
          ${this.row(labels.extras, extrasText)}
          ${this.row(labels.subtotal, `$${reservation.subtotalMXN} ${reservation.currency}`)}
          ${this.row(labels.discounts, discountsText)}
          ${this.row(labels.total, `$${reservation.totalMXN} ${reservation.currency}`)}
        </table>
      `;
    }
  
    private row(label: string, value: string) {
      return `
        <tr>
          <td style="border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb; font-weight: bold; width: 35%;">
            ${label}
          </td>
          <td style="border: 1px solid #e5e7eb; padding: 10px;">
            ${value}
          </td>
        </tr>
      `;
    }
  
    private escape(value: string) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }