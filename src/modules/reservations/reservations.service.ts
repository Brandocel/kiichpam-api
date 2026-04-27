import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { QuoteDto } from './dto/quote.dto';
import { ReservationPricingService } from './reservation-pricing.service';
import { UpdateReservationContactDto } from './dto/update-reservation-contact.dto';
import { ReservationMailService } from './reservation-mail.service';
import { QueryReservationsDto } from './dto/query-reservations.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: ReservationPricingService,
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

    const reservation = await this.prisma.$transaction(async (tx) => {
      const folio = await this.generateFolio(tx);

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
                step: 'FOLIO_GENERATED',
                message: 'Folio generated using database sequence',
                metadata: {
                  folio,
                  source: 'reservation_folio_sequences',
                },
              },
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
        await tx.coupon.update({
          where: {
            code: calculation.couponSummary.code,
          },
          data: {
            uses: {
              increment: 1,
            },
          },
        });
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

  async findAll(query: QueryReservationsDto) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const limit =
      Number(query.limit) > 0 ? Math.min(Number(query.limit), 100) : 20;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const status = query.status?.trim().toUpperCase();
    const packageCode = query.packageCode?.trim().toUpperCase();
    const email = query.email?.trim().toLowerCase();

    const allowedSortBy = ['createdAt', 'visitDate', 'totalMXN'];
    const sortBy = allowedSortBy.includes(query.sortBy ?? '')
      ? query.sortBy!
      : 'createdAt';

    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const visitDateFilter: {
      gte?: Date;
      lte?: Date;
    } = {};

    if (query.from) {
      const fromDate = new Date(query.from);

      if (!Number.isNaN(fromDate.getTime())) {
        fromDate.setHours(0, 0, 0, 0);
        visitDateFilter.gte = fromDate;
      }
    }

    if (query.to) {
      const toDate = new Date(query.to);

      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        visitDateFilter.lte = toDate;
      }
    }

    const where: any = {
      ...(status ? { status } : {}),

      ...(email
        ? {
            email: {
              contains: email,
              mode: 'insensitive',
            },
          }
        : {}),

      ...(Object.keys(visitDateFilter).length > 0
        ? {
            visitDate: visitDateFilter,
          }
        : {}),

      ...(packageCode
        ? {
            package: {
              code: {
                contains: packageCode,
                mode: 'insensitive',
              },
            },
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                folio: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                firstName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                country: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, reservations, statusRows] = await this.prisma.$transaction([
      this.prisma.reservation.count({
        where,
      }),

      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          extras: true,
          payments: true,
          package: {
            include: {
              coverMedia: true,
            },
          },
        },
      }),

      this.prisma.reservation.findMany({
        select: {
          status: true,
        },
      }),
    ]);

    const byStatus = statusRows.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      message: 'Reservaciones obtenidas correctamente',
      filters: {
        page,
        limit,
        search: search ?? null,
        status: status ?? null,
        packageCode: packageCode ?? null,
        email: email ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        sortBy,
        sortOrder,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary: {
        total,
        byStatus,
      },
      data: reservations.map((reservation) => ({
        id: reservation.id,
        folio: reservation.folio,
        status: reservation.status,
        visitDate: reservation.visitDate,

        passengers: {
          adults: reservation.adults,
          children: reservation.children,
          infants: reservation.infants,
        },

        customer: {
          firstName: reservation.firstName,
          lastName: reservation.lastName,
          email: reservation.email,
          phone: reservation.phone,
          country: reservation.country,
          comments: reservation.comments,
        },

        package: reservation.package
          ? {
              id: reservation.package.id,
              code: reservation.package.code,
              currency: reservation.package.currency,
              coverMedia: reservation.package.coverMedia,
            }
          : null,

        pricing: {
          peopleSubtotalMXN: reservation.peopleSubtotalMXN,
          subtotalMXN: reservation.subtotalMXN,
          extrasMXN: reservation.extrasMXN,
          discountMXN: reservation.discountMXN,
          campaignDiscountMXN: reservation.campaignDiscountMXN,
          couponDiscountMXN: reservation.couponDiscountMXN,
          inapamDiscountMXN: reservation.inapamDiscountMXN,
          totalMXN: reservation.totalMXN,
          currency: reservation.currency,
        },

        campaign: {
          campaignCode: reservation.campaignCode,
          appliedCampaignCodes: reservation.appliedCampaignCodes,
        },

        coupon: {
          couponCode: reservation.couponCode,
          couponDiscountMXN: reservation.couponDiscountMXN,
        },

        extras: reservation.extras,
        payments: reservation.payments,

        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
      })),
    };
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

  private async generateFolio(tx: any) {
    const now = new Date();

    const year = now.getFullYear().toString().slice(-2);
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    const dateKey = `${year}${month}${day}`;

    const sequence = await tx.reservationFolioSequence.upsert({
      where: {
        dateKey,
      },
      create: {
        dateKey,
        lastValue: 1,
      },
      update: {
        lastValue: {
          increment: 1,
        },
      },
    });

    const consecutive = String(sequence.lastValue).padStart(5, '0');

    return `RSV-${dateKey}-${consecutive}`;
  }
}