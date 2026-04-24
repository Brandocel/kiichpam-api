import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { QuoteDto } from './dto/quote.dto';
import { ReservationPricingService } from './reservation-pricing.service';
import { UpdateReservationContactDto } from './dto/update-reservation-contact.dto';
import { ReservationMailService } from './reservation-mail.service';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: ReservationPricingService,
    private readonly couponsService: CouponsService,
    private readonly campaignsService: CampaignsService,
    private readonly reservationMailService: ReservationMailService,
  ) {}

  async quote(dto: QuoteDto) {
    const calculation = await this.pricingService.calculate(dto);

    return {
      package: calculation.packageSummary,
      pricing: calculation.pricing,
      passengers: calculation.passengers,
      extras: calculation.selectedExtras,
      campaigns: {
        primaryCampaignCode: calculation.primaryCampaignCode,
        appliedCampaignCodes: calculation.appliedCampaignCodes,
        appliedCampaigns: calculation.appliedCampaigns,
      },
      coupon: calculation.couponSummary,
      rules: calculation.rules,
      breakdown: calculation.breakdown,
      snapshot: calculation.snapshot,
    };
  }

  async create(dto: QuoteDto) {
    const calculation = await this.pricingService.calculate(dto);
    const folio = await this.generateFolio();

    const reservation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          folio,
          packageId: calculation.packageEntity.id,
          visitDate: new Date(dto.visitDate),

          adults: dto.adults,
          children: dto.children,
          infants: dto.infants,

          campaignCode: calculation.primaryCampaignCode,
          appliedCampaignCodes: calculation.appliedCampaignCodes.join(','),
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          utmContent: dto.utmContent ?? null,
          utmTerm: dto.utmTerm ?? null,
          fbclid: dto.fbclid ?? null,
          ttclid: dto.ttclid ?? null,

          couponCode: calculation.couponSummary?.code ?? null,
          couponDiscountMXN: calculation.pricing.couponDiscountMXN,

          inapamVisitors: calculation.pricing.inapamVisitors,
          inapamDiscountMXN: calculation.pricing.inapamDiscountMXN,

          campaignDiscountMXN: calculation.pricing.campaignDiscountMXN,
          discountMXN: calculation.pricing.discountMXN,

          peopleSubtotalMXN: calculation.pricing.peopleSubtotalWithCampaignMXN,
          subtotalMXN: calculation.pricing.subtotalMXN,
          extrasMXN: calculation.pricing.extrasMXN,
          totalMXN: calculation.pricing.totalMXN,

          currency: calculation.packageEntity.currency,
          status: 'DRAFT',

          pricingBreakdown: calculation.breakdown as any,

          snapshotLang: calculation.snapshot.lang,
          snapshotName: calculation.snapshot.name,
          snapshotDescription: calculation.snapshot.description,
          snapshotIncludes: calculation.snapshot.includes as any,
          snapshotExcludes: calculation.snapshot.excludes as any,
          snapshotNotes: calculation.snapshot.notes as any,
          snapshotAgeRules: calculation.snapshot.ageRules ?? undefined,

          extras: {
            create: calculation.selectedExtras.map((extra) => ({
              extraId: extra.extraId,
              code: extra.code,
              qty: extra.qty,
              priceMXN: extra.priceMXN,
              currency: extra.currency,
              name: extra.name,
              description: extra.description,
            })),
          },
          traces: {
            create: [
              {
                folio,
                step: 'QUOTE_RESOLVED',
                message: 'Reservation pricing resolved by backend',
                metadata: {
                  pricing: calculation.pricing,
                  campaigns: calculation.appliedCampaignCodes,
                  coupon: calculation.couponSummary,
                },
              },
            ],
          },
        },
        include: {
          extras: true,
          package: true,
          traces: true,
        },
      });

      if (calculation.couponSummary?.code) {
        await this.couponsService.incrementUse(calculation.couponSummary.code);
      }

      if (calculation.appliedCampaignCodes.length > 0) {
        for (const code of calculation.appliedCampaignCodes) {
          await tx.campaign.update({
            where: { code },
            data: {
              usedCount: {
                increment: 1,
              },
            },
          });
        }
      }

      return created;
    });

    return reservation;
  }

  async confirmPaidAndSendEmail(folio: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
      include: {
        extras: true,
        payments: true,
        traces: true,
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

    if (!reservation.email) {
      throw new BadRequestException(
        'No se puede enviar correo porque la reserva no tiene email',
      );
    }

    const updatedReservation = await this.prisma.reservation.update({
      where: { folio },
      data: {
        status: 'PAID',
        traces: {
          create: {
            folio,
            step: 'PAYMENT_CONFIRMED',
            message: 'Payment confirmed and reservation marked as PAID',
            metadata: {
              previousStatus: reservation.status,
            },
          },
        },
      },
      include: {
        extras: true,
        payments: true,
        traces: true,
        package: {
          include: {
            coverMedia: true,
          },
        },
      },
    });

    const emailResult =
      await this.reservationMailService.sendReservationPaidEmails(
        updatedReservation,
      );

    return {
      success: true,
      message: 'Reserva marcada como pagada y correo procesado',
      reservation: updatedReservation,
      email: emailResult,
    };
  }

  async resendPaidReservationEmail(folio: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
      include: {
        extras: true,
        payments: true,
        traces: true,
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

    if (reservation.status !== 'PAID') {
      throw new BadRequestException(
        'No se puede reenviar el correo porque la reserva todavía no está pagada',
      );
    }

    const emailResult =
      await this.reservationMailService.sendReservationPaidEmails(reservation);

    return {
      success: true,
      message: 'Correo reenviado/procesado correctamente',
      email: emailResult,
    };
  }

  async getEmailStatus(folio: string) {
    return this.reservationMailService.getEmailStatusByFolio(folio);
  }

  async findByFolio(folio: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { folio },
      include: {
        extras: true,
        payments: true,
        traces: true,
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

    return reservation;
  }

  async updateContact(folio: string, body: UpdateReservationContactDto) {
    const exists = await this.prisma.reservation.findUnique({
      where: { folio },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Reservation not found');
    }

    return this.prisma.reservation.update({
      where: { folio },
      data: {
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        country: body.country ?? null,
        comments: body.comments ?? null,
      },
    });
  }

  private async generateFolio() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    const folio = `RSV-${year}${month}${day}-${random}`;

    const exists = await this.prisma.reservation.findUnique({
      where: { folio },
      select: { id: true },
    });

    if (exists) {
      return this.generateFolio();
    }

    return folio;
  }
}