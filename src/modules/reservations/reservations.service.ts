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

type MoneyLike =
  | number
  | string
  | null
  | undefined
  | {
      toNumber?: () => number;
    };

type MoneyRecord = Record<string, any>;

@Injectable()
export class ReservationsService {
  private static readonly PAYMENT_MONEY_FIELDS = [
    'amount',
    'amountMXN',
    'total',
    'totalMXN',
    'subtotal',
    'subtotalMXN',
    'fee',
    'feeMXN',
    'tax',
    'taxMXN',
    'discount',
    'discountMXN',
    'refundedAmount',
    'refundedAmountMXN',
    'refundAmount',
    'refundAmountMXN',
    'stripeAmount',
    'stripeAmountMXN',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: ReservationPricingService,
    private readonly campaignsService: CampaignsService,
    private readonly reservationMailService: ReservationMailService,
  ) {}

  async quote(dto: QuoteDto) {
    const calculation = await this.pricingService.calculate(dto);
    const reference = this.resolveReservationReference(dto);

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
      attribution: this.buildDtoAttribution(dto, reference),
    };
  }

  async create(dto: QuoteDto) {
    const calculation = await this.pricingService.calculate(dto);
    const reference = this.resolveReservationReference(dto);
    const attribution = this.buildDtoAttribution(dto, reference);

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
          appliedCampaignCodes: calculation.appliedCampaignCodes,

          reference,
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          utmContent: dto.utmContent ?? null,
          utmTerm: dto.utmTerm ?? null,
          fbclid: dto.fbclid ?? null,
          ttclid: dto.ttclid ?? null,
          gclid: dto.gclid ?? null,

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
                message: 'Folio consecutivo generado correctamente',
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
                  attribution,
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

    return this.mapReservationWithAttribution(reservation);
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
    const reference = query.reference?.trim();

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

      ...(reference
        ? {
            reference: {
              contains: reference,
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
              {
                reference: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                utmSource: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                utmMedium: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                utmCampaign: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                utmContent: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                utmTerm: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                fbclid: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                ttclid: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                gclid: {
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
        reference: reference ?? null,
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
      data: reservations.map((reservation) => {
        const resolvedReference =
          this.resolveStoredReservationReference(reservation);

        return {
          id: reservation.id,
          folio: reservation.folio,
          status: reservation.status,
          visitDate: reservation.visitDate,

          reference: resolvedReference,
          attribution: {
            reference: resolvedReference,
            utmSource: reservation.utmSource,
            utmMedium: reservation.utmMedium,
            utmCampaign: reservation.utmCampaign,
            utmContent: reservation.utmContent,
            utmTerm: reservation.utmTerm,
            fbclid: reservation.fbclid,
            ttclid: reservation.ttclid,
            gclid: reservation.gclid,
          },

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

          pricing: this.mapReservationPricingToPesos(reservation),

          campaign: {
            campaignCode: reservation.campaignCode,
            appliedCampaignCodes: reservation.appliedCampaignCodes,
          },

          coupon: {
            couponCode: reservation.couponCode,
            couponDiscountMXN: this.centsToPesosOrZero(
              reservation.couponDiscountMXN,
            ),
          },

          extras: reservation.extras.map((extra) =>
            this.mapExtraToPesos(extra),
          ),
          payments: reservation.payments.map((payment) =>
            this.mapPaymentToPesos(payment),
          ),

          createdAt: reservation.createdAt,
          updatedAt: reservation.updatedAt,
        };
      }),
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
      reservation: this.mapReservationWithAttribution(updatedReservation),
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
      reservation: this.mapReservationWithAttribution(reservation),
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

    return this.mapReservationWithAttribution(reservation);
  }

  async deleteByFolio(folio: string) {
    const normalizedFolio = folio?.trim();

    if (!normalizedFolio) {
      throw new BadRequestException('Reservation folio is required');
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: {
        folio: normalizedFolio,
      },
      select: {
        id: true,
        folio: true,
        status: true,
        couponCode: true,
        appliedCampaignCodes: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    const campaignCodes = this.normalizeAppliedCampaignCodes(
      reservation.appliedCampaignCodes,
    );

    const deletedResult = await this.prisma.$transaction(async (tx) => {
      const deletedExtras = await tx.reservationExtra.deleteMany({
        where: {
          reservationId: reservation.id,
        },
      });

      const deletedPayments = await tx.payment.deleteMany({
        where: {
          reservationId: reservation.id,
        },
      });

      const deletedTraces = await tx.reservationTrace.deleteMany({
        where: {
          reservationId: reservation.id,
        },
      });

      const deletedReservation = await tx.reservation.delete({
        where: {
          id: reservation.id,
        },
      });

      if (reservation.couponCode) {
        await tx.coupon.updateMany({
          where: {
            code: reservation.couponCode,
            uses: {
              gt: 0,
            },
          },
          data: {
            uses: {
              decrement: 1,
            },
          },
        });
      }

      for (const code of campaignCodes) {
        await tx.campaign.updateMany({
          where: {
            code,
            usedCount: {
              gt: 0,
            },
          },
          data: {
            usedCount: {
              decrement: 1,
            },
          },
        });
      }

      return {
        reservation: deletedReservation,
        deletedRelations: {
          extras: deletedExtras.count,
          payments: deletedPayments.count,
          traces: deletedTraces.count,
        },
        restoredCounters: {
          couponCode: reservation.couponCode ?? null,
          campaignCodes,
        },
      };
    });

    return {
      success: true,
      message: 'Reservación eliminada correctamente',
      deleted: {
        id: deletedResult.reservation.id,
        folio: deletedResult.reservation.folio,
        status: deletedResult.reservation.status,
      },
      deletedRelations: deletedResult.deletedRelations,
      restoredCounters: deletedResult.restoredCounters,
    };
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

  private buildDtoAttribution(dto: QuoteDto, reference: string) {
    return {
      reference,
      utmSource: dto.utmSource ?? null,
      utmMedium: dto.utmMedium ?? null,
      utmCampaign: dto.utmCampaign ?? null,
      utmContent: dto.utmContent ?? null,
      utmTerm: dto.utmTerm ?? null,
      fbclid: dto.fbclid ?? null,
      ttclid: dto.ttclid ?? null,
      gclid: dto.gclid ?? null,
    };
  }

  private mapReservationWithAttribution<T extends MoneyRecord>(reservation: T) {
    const reference = this.resolveStoredReservationReference(reservation);

    return {
      ...reservation,
      reference,
      attribution: {
        reference,
        utmSource: reservation.utmSource ?? null,
        utmMedium: reservation.utmMedium ?? null,
        utmCampaign: reservation.utmCampaign ?? null,
        utmContent: reservation.utmContent ?? null,
        utmTerm: reservation.utmTerm ?? null,
        fbclid: reservation.fbclid ?? null,
        ttclid: reservation.ttclid ?? null,
        gclid: reservation.gclid ?? null,
      },
    };
  }

  private resolveReservationReference(dto: QuoteDto): string {
    const explicitReference = this.normalizeReference(dto.reference);

    if (explicitReference) {
      return explicitReference;
    }

    const sourceReference = this.normalizeReference(dto.utmSource);

    if (sourceReference) {
      return sourceReference;
    }

    if (dto.fbclid) {
      return 'Facebook';
    }

    if (dto.ttclid) {
      return 'TikTok';
    }

    if (dto.gclid) {
      return 'Google';
    }

    return 'Pagina WEB';
  }

  private resolveStoredReservationReference(reservation: {
    reference?: string | null;
    utmSource?: string | null;
    fbclid?: string | null;
    ttclid?: string | null;
    gclid?: string | null;
  }) {
    const explicitReference = this.normalizeReference(reservation.reference);

    if (explicitReference) {
      return explicitReference;
    }

    const sourceReference = this.normalizeReference(reservation.utmSource);

    if (sourceReference) {
      return sourceReference;
    }

    if (reservation.fbclid) {
      return 'Facebook';
    }

    if (reservation.ttclid) {
      return 'TikTok';
    }

    if (reservation.gclid) {
      return 'Google';
    }

    return 'Pagina WEB';
  }

  private normalizeReference(value?: string | null): string | null {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    const referenceMap: Record<string, string> = {
      facebook: 'Facebook',
      fb: 'Facebook',
      meta: 'Facebook',

      instagram: 'Instagram',
      ig: 'Instagram',

      tiktok: 'TikTok',
      tik_tok: 'TikTok',
      tt: 'TikTok',

      whatsapp: 'WhatsApp',
      whats: 'WhatsApp',
      wa: 'WhatsApp',

      google: 'Google',
      g: 'Google',

      directo: 'Directo',
      direct: 'Directo',

      agencia: 'Agencias',
      agencias: 'Agencias',
      agency: 'Agencias',
      agencies: 'Agencias',

      taxi: 'Taxis',
      taxis: 'Taxis',

      hotel: 'Hotel',
      hoteles: 'Hotel',

      web: 'Pagina WEB',
      website: 'Pagina WEB',
      paginaweb: 'Pagina WEB',
      'pagina web': 'Pagina WEB',
      page: 'Pagina WEB',
    };

    return referenceMap[normalized] ?? value.trim();
  }

  private mapReservationPricingToPesos(reservation: MoneyRecord) {
    return {
      peopleSubtotalMXN: this.centsToPesosOrZero(
        reservation.peopleSubtotalMXN,
      ),
      subtotalMXN: this.centsToPesosOrZero(reservation.subtotalMXN),
      extrasMXN: this.centsToPesosOrZero(reservation.extrasMXN),
      discountMXN: this.centsToPesosOrZero(reservation.discountMXN),
      campaignDiscountMXN: this.centsToPesosOrZero(
        reservation.campaignDiscountMXN,
      ),
      couponDiscountMXN: this.centsToPesosOrZero(
        reservation.couponDiscountMXN,
      ),
      inapamDiscountMXN: this.centsToPesosOrZero(
        reservation.inapamDiscountMXN,
      ),
      totalMXN: this.centsToPesosOrZero(reservation.totalMXN),
      currency: reservation.currency,
    };
  }

  private mapExtraToPesos<T extends MoneyRecord>(extra: T): T {
    const normalized: MoneyRecord = { ...extra };

    if (Object.prototype.hasOwnProperty.call(normalized, 'priceMXN')) {
      normalized.priceMXN = this.centsToPesosOrZero(normalized.priceMXN);
    }

    return normalized as T;
  }

  private mapPaymentToPesos<T extends MoneyRecord>(payment: T): T {
    return this.mapMoneyFieldsToPesos(
      payment,
      ReservationsService.PAYMENT_MONEY_FIELDS,
    );
  }

  private mapMoneyFieldsToPesos<T extends MoneyRecord>(
    item: T,
    fields: string[],
  ): T {
    const normalized: MoneyRecord = { ...item };

    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(normalized, field)) {
        normalized[field] = this.centsToPesosOrZero(normalized[field]);
      }
    }

    return normalized as T;
  }

  private centsToPesosOrZero(value: MoneyLike): number {
    return this.centsToPesos(value) ?? 0;
  }

  private centsToPesos(value: MoneyLike): number | null {
    const amount = this.toSafeNumber(value);

    if (amount === null) {
      return null;
    }

    return amount / 100;
  }

  private toSafeNumber(value: MoneyLike): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (
      typeof value === 'object' &&
      typeof value.toNumber === 'function'
    ) {
      const parsed = value.toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizeAppliedCampaignCodes(appliedCampaignCodes: unknown): string[] {
    if (!appliedCampaignCodes) {
      return [];
    }

    const normalizeString = (value: string): string[] => {
      return value
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
    };

    let codes: string[] = [];

    if (typeof appliedCampaignCodes === 'string') {
      codes = normalizeString(appliedCampaignCodes);
    }

    if (Array.isArray(appliedCampaignCodes)) {
      codes = appliedCampaignCodes.flatMap((item) => {
        if (typeof item === 'string') {
          return normalizeString(item);
        }

        return [];
      });
    }

    return Array.from(new Set(codes));
  }

  private async generateFolio(tx: any): Promise<string> {
    const sequenceKey = 'RESERVATION_GLOBAL';

    const sequence = await tx.reservationFolioSequence.upsert({
      where: {
        dateKey: sequenceKey,
      },
      create: {
        dateKey: sequenceKey,
        lastValue: 10000,
      },
      update: {
        lastValue: {
          increment: 1,
        },
      },
    });

    if (sequence.lastValue > 99999) {
      throw new BadRequestException(
        'Se alcanzó el límite de folios consecutivos de 5 números.',
      );
    }

    return String(sequence.lastValue);
  }
}