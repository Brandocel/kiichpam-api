import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
  } from '@nestjs/common';
  import { Resend } from 'resend';
  import { CreateContactMessageDto } from './dto/create-contact-message.dto';
  
  @Injectable()
  export class ContactService {
    private readonly resend: Resend;
  
    constructor() {
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is required');
      }
  
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  
    async sendContactMessage(dto: CreateContactMessageDto) {
      const from = process.env.MAIL_FROM;
      const to =
        process.env.MAIL_CONTACT_TO ||
        process.env.MAIL_OPERATIONS_EMAIL ||
        process.env.NOTIFICATION_EMAIL;
  
      if (!from) {
        throw new BadRequestException('MAIL_FROM is required');
      }
  
      if (!to) {
        throw new BadRequestException(
          'MAIL_CONTACT_TO or MAIL_OPERATIONS_EMAIL is required',
        );
      }
  
      const lang = dto.lang === 'en' ? 'en' : 'es';
  
      const subject =
        dto.subject?.trim() ||
        (lang === 'en'
          ? `New contact message - ${this.getSubjectTypeLabel(dto.subjectType, lang)}`
          : `Nuevo mensaje de contacto - ${this.getSubjectTypeLabel(dto.subjectType, lang)}`);
  
      const html = this.contactTemplate(dto, lang);
  
      try {
        const { data, error } = await this.resend.emails.send({
          from,
          to,
          replyTo: dto.email,
          subject,
          html,
        });
  
        if (error) {
          throw new InternalServerErrorException({
            message: 'Resend no pudo enviar el correo de contacto',
            error,
          });
        }
  
        return {
          success: true,
          message:
            lang === 'en'
              ? 'Contact message sent successfully'
              : 'Mensaje de contacto enviado correctamente',
          data: {
            provider: 'RESEND',
            providerId: data?.id ?? null,
            to,
            replyTo: dto.email,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
  
        throw new InternalServerErrorException({
          message: 'Error enviando correo de contacto',
          error: message,
        });
      }
    }
  
    private contactTemplate(dto: CreateContactMessageDto, lang: 'es' | 'en') {
      const labels =
        lang === 'en'
          ? {
              title: 'New contact message',
              intro: 'A new message was received from the website contact form.',
              name: 'Name',
              email: 'Email',
              phone: 'Phone',
              country: 'Country',
              subjectType: 'Request type',
              subject: 'Subject',
              message: 'Message',
              notProvided: 'Not provided',
            }
          : {
              title: 'Nuevo mensaje de contacto',
              intro:
                'Se recibió un nuevo mensaje desde el formulario de contacto del sitio web.',
              name: 'Nombre',
              email: 'Correo',
              phone: 'Teléfono',
              country: 'País',
              subjectType: 'Tipo de solicitud',
              subject: 'Asunto',
              message: 'Mensaje',
              notProvided: 'No proporcionado',
            };
  
      return `
        <div style="font-family: Arial, sans-serif; max-width: 720px; margin: auto; color: #111827;">
          <div style="background: #00586F; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">${labels.title}</h1>
          </div>
  
          <div style="border: 1px solid #e5e7eb; border-top: 0; padding: 24px; border-radius: 0 0 12px 12px;">
            <p>${labels.intro}</p>
  
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              ${this.row(labels.name, this.escape(dto.name))}
              ${this.row(labels.email, this.escape(dto.email))}
              ${this.row(labels.phone, this.escape(dto.phone || labels.notProvided))}
              ${this.row(labels.country, this.escape(dto.country || labels.notProvided))}
              ${this.row(
                labels.subjectType,
                this.escape(this.getSubjectTypeLabel(dto.subjectType, lang)),
              )}
              ${this.row(labels.subject, this.escape(dto.subject || labels.notProvided))}
              ${this.row(labels.message, this.escape(dto.message).replace(/\n/g, '<br/>'))}
            </table>
          </div>
        </div>
      `;
    }
  
    private getSubjectTypeLabel(value?: string, lang: 'es' | 'en' = 'es') {
      const type = value || 'general';
  
      const labels: Record<string, { es: string; en: string }> = {
        general: {
          es: 'General',
          en: 'General',
        },
        reservations: {
          es: 'Reservaciones',
          en: 'Reservations',
        },
        events: {
          es: 'Eventos',
          en: 'Events',
        },
        promotions: {
          es: 'Promociones',
          en: 'Promotions',
        },
        support: {
          es: 'Soporte',
          en: 'Support',
        },
      };
  
      return labels[type]?.[lang] || labels.general[lang];
    }
  
    private row(label: string, value: string) {
      return `
        <tr>
          <td style="border: 1px solid #e5e7eb; padding: 10px; background: #f9fafb; font-weight: bold; width: 32%;">
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