import { Injectable, Logger } from '@nestjs/common';
import { calendar_v3, google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';

type ProposalReservationCalendarInput = {
  folio: string;
  packageCode: string;
  packageName: string;
  customerName: string;
  partnerName?: string;
  email?: string;
  phone?: string;
  reservationDate: string | Date;
  startTime: string;
  endTime: string;
  guests?: number;
  notes?: string;
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly calendar: calendar_v3.Calendar | null;
  private readonly calendarId: string | null;
  private readonly timeZone: string;
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
      /\\n/g,
      '\n',
    );
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    const timeZone = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'America/Cancun';

    this.calendarId = calendarId ?? null;
    this.timeZone = timeZone;

    if (!clientEmail || !privateKey || !calendarId) {
      this.enabled = false;
      this.calendar = null;

      this.logger.warn(
        'Google Calendar deshabilitado. Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY o GOOGLE_CALENDAR_ID',
      );
      return;
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    this.calendar = google.calendar({
      version: 'v3',
      auth,
    });

    this.enabled = true;
  }

  async upsertReservationEvent(reservation: any) {
    try {
      if (!this.enabled || !this.calendar || !this.calendarId) {
        const result = {
          enabled: false,
          created: false,
          updated: false,
          message: 'Google Calendar no está configurado',
          requiredEnv: [
            'GOOGLE_SERVICE_ACCOUNT_EMAIL',
            'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
            'GOOGLE_CALENDAR_ID',
          ],
        };

        this.logger.warn(
          `No se creó evento de calendario para ${
            reservation?.folio ?? 'N/A'
          } porque Google Calendar no está configurado`,
        );

        await this.createCalendarTrace({
          reservationId: reservation?.id,
          folio: reservation?.folio,
          step: 'GOOGLE_CALENDAR_SYNC_FAILED',
          message: 'Google Calendar no está configurado',
          metadata: result,
        });

        return result;
      }

      if (!reservation?.folio) {
        throw new Error('La reservación no tiene folio');
      }

      if (!reservation?.visitDate) {
        throw new Error(`La reservación ${reservation.folio} no tiene visitDate`);
      }

      const existingEvent = await this.findExistingEventByFolio(
        reservation.folio,
        reservation.visitDate,
      );

      const requestBody = this.buildReservationEvent(reservation);

      if (existingEvent?.id) {
        const updated = await this.calendar.events.update({
          calendarId: this.calendarId,
          eventId: existingEvent.id,
          requestBody,
        });

        const result = {
          enabled: true,
          created: false,
          updated: true,
          eventId: updated.data.id,
          htmlLink: updated.data.htmlLink,
        };

        this.logger.log(
          `Evento de Google Calendar actualizado para folio ${reservation.folio}. EventId=${updated.data.id}`,
        );

        await this.createCalendarTrace({
          reservationId: reservation.id,
          folio: reservation.folio,
          step: 'GOOGLE_CALENDAR_SYNCED',
          message: 'Evento de Google Calendar actualizado correctamente',
          metadata: result,
        });

        return result;
      }

      const inserted = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody,
      });

      const result = {
        enabled: true,
        created: true,
        updated: false,
        eventId: inserted.data.id,
        htmlLink: inserted.data.htmlLink,
      };

      this.logger.log(
        `Evento de Google Calendar creado para folio ${reservation.folio}. EventId=${inserted.data.id}`,
      );

      await this.createCalendarTrace({
        reservationId: reservation.id,
        folio: reservation.folio,
        step: 'GOOGLE_CALENDAR_SYNCED',
        message: 'Evento de Google Calendar creado correctamente',
        metadata: result,
      });

      return result;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Error al sincronizar Google Calendar para ${
          reservation?.folio ?? 'N/A'
        }: ${message}`,
      );

      await this.createCalendarTrace({
        reservationId: reservation?.id,
        folio: reservation?.folio,
        step: 'GOOGLE_CALENDAR_SYNC_FAILED',
        message: 'Falló la sincronización con Google Calendar',
        metadata: {
          error: message,
        },
      });

      return {
        enabled: this.enabled,
        created: false,
        updated: false,
        error: message,
      };
    }
  }

  async upsertProposalReservationEvent(
    reservation: ProposalReservationCalendarInput,
  ) {
    if (!this.enabled || !this.calendar || !this.calendarId) {
      this.logger.warn(
        `No se creó evento de calendario para ${reservation?.folio ?? 'N/A'} porque Google Calendar no está configurado`,
      );

      return {
        enabled: false,
        created: false,
        updated: false,
        message: 'Google Calendar no está configurado',
      };
    }

    if (!reservation?.folio) {
      throw new Error('La reservación de pedida no tiene folio');
    }

    if (!reservation?.reservationDate) {
      throw new Error(
        `La reservación ${reservation.folio} no tiene reservationDate`,
      );
    }

    const existingEvent = await this.findExistingEventByFolio(
      reservation.folio,
      reservation.reservationDate,
    );

    const requestBody = this.buildProposalReservationEvent(reservation);

    if (existingEvent?.id) {
      const updated = await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: existingEvent.id,
        requestBody,
      });

      this.logger.log(
        `Evento de pedida actualizado para folio ${reservation.folio}. EventId=${updated.data.id}`,
      );

      return {
        enabled: true,
        created: false,
        updated: true,
        eventId: updated.data.id,
        htmlLink: updated.data.htmlLink,
      };
    }

    const inserted = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody,
    });

    this.logger.log(
      `Evento de pedida creado para folio ${reservation.folio}. EventId=${inserted.data.id}`,
    );

    return {
      enabled: true,
      created: true,
      updated: false,
      eventId: inserted.data.id,
      htmlLink: inserted.data.htmlLink,
    };
  }

  async cancelReservationEventByFolio(
    folio: string,
    visitDate?: Date | string | null,
  ) {
    if (!this.enabled || !this.calendar || !this.calendarId) {
      return {
        enabled: false,
        canceled: false,
        message: 'Google Calendar no está configurado',
      };
    }

    const event = visitDate
      ? await this.findExistingEventByFolio(folio, visitDate)
      : await this.findExistingEventWithoutDate(folio);

    if (!event?.id) {
      return {
        enabled: true,
        canceled: false,
        message: `No se encontró evento para el folio ${folio}`,
      };
    }

    await this.calendar.events.patch({
      calendarId: this.calendarId,
      eventId: event.id,
      requestBody: {
        status: 'cancelled',
      },
    });

    this.logger.warn(
      `Evento de Google Calendar cancelado para folio ${folio}. EventId=${event.id}`,
    );

    return {
      enabled: true,
      canceled: true,
      eventId: event.id,
    };
  }

  private async createCalendarTrace(params: {
    reservationId?: string | null;
    folio?: string | null;
    step: string;
    message: string;
    metadata?: any;
  }) {
    try {
      if (!params.reservationId || !params.folio) {
        this.logger.warn(
          `No se pudo guardar trace de calendario porque falta reservationId o folio. Step=${params.step}`,
        );
        return;
      }

      await this.prisma.reservationTrace.create({
        data: {
          reservationId: params.reservationId,
          folio: params.folio,
          step: params.step,
          message: params.message,
          metadata: params.metadata ?? undefined,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `No se pudo guardar trace de Google Calendar: ${error.message}`,
      );
    }
  }

  private async findExistingEventByFolio(
    folio: string,
    visitDate: Date | string,
  ): Promise<calendar_v3.Schema$Event | null> {
    if (!this.calendar || !this.calendarId) {
      return null;
    }

    const normalizedFolio = folio.trim().toUpperCase();
    const datePart = this.getDatePart(visitDate);

    const dayStart = new Date(`${datePart}T00:00:00-05:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const response = await this.calendar.events.list({
      calendarId: this.calendarId,
      q: normalizedFolio,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const items = response.data.items ?? [];

    const found =
      items.find(
        (event) =>
          event.extendedProperties?.private?.folio === normalizedFolio,
      ) ??
      items.find(
        (event) =>
          event.summary?.includes(normalizedFolio) ||
          event.description?.includes(`Folio: ${normalizedFolio}`),
      ) ??
      null;

    return found;
  }

  private async findExistingEventWithoutDate(
    folio: string,
  ): Promise<calendar_v3.Schema$Event | null> {
    if (!this.calendar || !this.calendarId) {
      return null;
    }

    const normalizedFolio = folio.trim().toUpperCase();

    const response = await this.calendar.events.list({
      calendarId: this.calendarId,
      q: normalizedFolio,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const items = response.data.items ?? [];

    const found =
      items.find(
        (event) =>
          event.extendedProperties?.private?.folio === normalizedFolio,
      ) ??
      items.find(
        (event) =>
          event.summary?.includes(normalizedFolio) ||
          event.description?.includes(`Folio: ${normalizedFolio}`),
      ) ??
      null;

    return found;
  }

  private buildReservationEvent(reservation: any): calendar_v3.Schema$Event {
    const datePart = this.getDatePart(reservation.visitDate);

    const startDateTime = `${datePart}T09:00:00`;
    const endDateTime = `${datePart}T10:00:00`;

    const packageName =
      reservation.snapshotName ||
      reservation.package?.code ||
      'Reservación Kiichpam';

    const customerName =
      [reservation.firstName, reservation.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Cliente sin nombre';

    const extrasText =
      Array.isArray(reservation.extras) && reservation.extras.length > 0
        ? reservation.extras
            .map(
              (extra: any) =>
                `- ${extra.name ?? extra.code ?? 'Extra'} x${extra.qty ?? 1}`,
            )
            .join('\n')
        : '- Sin extras';

    const descriptionLines = [
      `Folio: ${reservation.folio}`,
      `Cliente: ${customerName}`,
      `Correo: ${reservation.email ?? 'N/D'}`,
      `Teléfono: ${reservation.phone ?? 'N/D'}`,
      `Paquete: ${packageName}`,
      `Fecha de visita: ${datePart}`,
      `Adultos: ${reservation.adults ?? 0}`,
      `Niños: ${reservation.children ?? 0}`,
      `Infantes: ${reservation.infants ?? 0}`,
      `Total MXN: ${reservation.totalMXN ?? 0}`,
      `Estado: ${reservation.status ?? 'PAID'}`,
      '',
      'Extras:',
      extrasText,
      '',
      `Comentarios: ${reservation.comments ?? 'Sin comentarios'}`,
    ];

    return {
      summary: `Reserva ${reservation.folio} - ${packageName}`,
      description: descriptionLines.join('\n'),
      start: {
        dateTime: startDateTime,
        timeZone: this.timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: this.timeZone,
      },
      extendedProperties: {
        private: {
          folio: reservation.folio,
          reservationId: reservation.id ?? '',
          packageId: reservation.packageId ?? '',
          source: 'stripe_paid_webhook',
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          {
            method: 'popup',
            minutes: 0,
          },
        ],
      },
    };
  }

  private buildProposalReservationEvent(
    reservation: ProposalReservationCalendarInput,
  ): calendar_v3.Schema$Event {
    const datePart = this.getDatePart(reservation.reservationDate);
    const startDateTime = this.combineDateAndTime(
      datePart,
      reservation.startTime,
    );
    const endDateTime = this.combineDateAndTime(datePart, reservation.endTime);

    const descriptionLines = [
      `Folio: ${reservation.folio}`,
      `Tipo: Pedida de mano`,
      `Cliente: ${reservation.customerName}`,
      `Pareja: ${reservation.partnerName ?? 'N/D'}`,
      `Correo: ${reservation.email ?? 'N/D'}`,
      `Teléfono: ${reservation.phone ?? 'N/D'}`,
      `Paquete: ${reservation.packageName}`,
      `Código paquete: ${reservation.packageCode}`,
      `Fecha: ${datePart}`,
      `Hora inicio: ${reservation.startTime}`,
      `Hora fin: ${reservation.endTime}`,
      `Asistentes: ${reservation.guests ?? 2}`,
      '',
      `Notas: ${reservation.notes ?? 'Sin comentarios'}`,
    ];

    return {
      summary: `Pedida ${reservation.folio} - ${reservation.packageName}`,
      description: descriptionLines.join('\n'),
      start: {
        dateTime: startDateTime,
        timeZone: this.timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: this.timeZone,
      },
      extendedProperties: {
        private: {
          folio: reservation.folio.trim().toUpperCase(),
          packageCode: reservation.packageCode,
          reservationType: 'proposal',
          source: 'proposal_reservations_api',
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          {
            method: 'popup',
            minutes: 60,
          },
          {
            method: 'popup',
            minutes: 10,
          },
        ],
      },
    };
  }

  private combineDateAndTime(datePart: string, time: string): string {
    return `${datePart}T${time}:00`;
  }

  private getDatePart(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}