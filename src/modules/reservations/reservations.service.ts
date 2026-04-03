import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteDto } from './dto/quote.dto';
import { CouponsService } from '../coupons/coupons.service';

@Injectable()
export class ReservationsService {
  private static readonly INAPAM_PERCENT = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
  ) {}

  async quote(dto: QuoteDto) {
    const calculation = await this.buildReservationCalculation(dto);

    return {
      package: calculation.packageSummary,
      pricing: calculation.pricing,
      passengers: calculation.passengers,
      extras: calculation.selectedExtras,
      coupon: calculation.couponSummary,
      snapshot: calculation.snapshot,
    };
  }

  async create(dto: QuoteDto) {
    const calculation = await this.buildReservationCalculation(dto);
    const folio = await this.generateFolio();

    const reservation = await this.prisma.reservation.create({
      data: {
        folio,
        packageId: calculation.packageEntity.id,
        visitDate: new Date(dto.visitDate),

        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,

        campaignCode: dto.campaignCode?.trim().toUpperCase() || null,
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

        discountMXN: calculation.pricing.discountMXN,
        subtotalMXN: calculation.pricing.subtotalMXN,
        extrasMXN: calculation.pricing.extrasMXN,
        totalMXN: calculation.pricing.totalMXN,

        currency: calculation.packageEntity.currency,
        status: 'DRAFT',

        snapshotLang: calculation.snapshot.lang,
        snapshotName: calculation.snapshot.name,
        snapshotDescription: calculation.snapshot.description,
        snapshotIncludes: calculation.snapshot.includes,
        snapshotExcludes: calculation.snapshot.excludes,
        snapshotNotes: calculation.snapshot.notes,
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
      },
      include: {
        extras: true,
        package: true,
      },
    });

    if (calculation.couponSummary?.code) {
      await this.couponsService.incrementUse(calculation.couponSummary.code);
    }

    return reservation;
  }

  async findByFolio(folio: string) {
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
      throw new NotFoundException('Reservation not found');
    }

    return reservation;
  }

  async updateContact(
    folio: string,
    body: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      country?: string;
      comments?: string;
    },
  ) {
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

  private async buildReservationCalculation(dto: QuoteDto) {
    this.validatePeople(dto);

    const normalizedPackageCode = dto.packageCode.trim().toUpperCase();
    const normalizedCampaignCode = dto.campaignCode?.trim().toUpperCase();
    const normalizedCouponCode = dto.couponCode?.trim().toUpperCase();
    const normalizedLang = dto.lang?.trim().toLowerCase() === 'en' ? 'en' : 'es';

    const pkg = await this.prisma.package.findUnique({
      where: { code: normalizedPackageCode },
      include: {
        translations: true,
        extras: {
          where: { isActive: true },
          include: {
            translations: true,
          },
        },
        coverMedia: true,
      },
    });

    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found or inactive');
    }

    const translation =
      pkg.translations.find((t) => t.lang === normalizedLang) ??
      pkg.translations.find((t) => t.lang === 'es') ??
      pkg.translations[0] ??
      null;

    const selectedExtras = this.normalizeExtras(dto.extras ?? []);
    const resolvedExtras = this.resolveExtras(pkg.extras, selectedExtras, normalizedLang);

    const peopleSubtotalMXN =
      dto.adults * pkg.adultPriceMXN +
      dto.children * pkg.childPriceMXN +
      dto.infants * pkg.infantPriceMXN;

    const extrasMXN = resolvedExtras.reduce(
      (acc, item) => acc + item.priceMXN * item.qty,
      0,
    );

    const subtotalMXN = peopleSubtotalMXN + extrasMXN;

    const inapamVisitors = Math.min(dto.inapamVisitors ?? 0, dto.adults);
    const inapamDiscountMXN = Math.floor(
      inapamVisitors * pkg.adultPriceMXN * (ReservationsService.INAPAM_PERCENT / 100),
    );

    let couponDiscountMXN = 0;
    let couponSummary: {
      code: string;
      type: string;
      value: number;
      scope: string;
    } | null = null;

    const subtotalAfterInapam = Math.max(subtotalMXN - inapamDiscountMXN, 0);

    if (normalizedCouponCode) {
      const couponResult = await this.couponsService.calculateDiscount({
        couponCode: normalizedCouponCode,
        subtotalMXN: subtotalAfterInapam,
        packageCode: normalizedPackageCode,
        campaignCode: normalizedCampaignCode,
      });

      couponDiscountMXN = couponResult.discountMXN;
      couponSummary = {
        code: couponResult.coupon.code,
        type: couponResult.coupon.type,
        value: couponResult.coupon.value,
        scope: couponResult.coupon.scope,
      };
    }

    const discountMXN = inapamDiscountMXN + couponDiscountMXN;
    const totalMXN = Math.max(subtotalMXN - discountMXN, 0);

    return {
      packageEntity: pkg,
      packageSummary: {
        id: pkg.id,
        code: pkg.code,
        currency: pkg.currency,
        coverMedia: pkg.coverMedia,
      },
      passengers: {
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
      },
      selectedExtras: resolvedExtras,
      couponSummary,
      snapshot: {
        lang: normalizedLang,
        name: translation?.name ?? pkg.code,
        description: translation?.description ?? null,
        includes: translation?.includes ?? [],
        excludes: translation?.excludes ?? [],
        notes: translation?.notes ?? [],
        ageRules: pkg.ageRules ?? null,
      },
      pricing: {
        adultPriceMXN: pkg.adultPriceMXN,
        childPriceMXN: pkg.childPriceMXN,
        infantPriceMXN: pkg.infantPriceMXN,

        adultsTotalMXN: dto.adults * pkg.adultPriceMXN,
        childrenTotalMXN: dto.children * pkg.childPriceMXN,
        infantsTotalMXN: dto.infants * pkg.infantPriceMXN,

        peopleSubtotalMXN,
        extrasMXN,
        subtotalMXN,

        inapamPercent: ReservationsService.INAPAM_PERCENT,
        inapamVisitors,
        inapamDiscountMXN,

        couponDiscountMXN,
        discountMXN,
        totalMXN,
      },
    };
  }

  private validatePeople(dto: QuoteDto) {
    const totalPeople = dto.adults + dto.children + dto.infants;

    if (totalPeople <= 0) {
      throw new BadRequestException('At least one visitor is required');
    }

    if (dto.adults < 0 || dto.children < 0 || dto.infants < 0) {
      throw new BadRequestException('Visitors values are invalid');
    }

    if ((dto.inapamVisitors ?? 0) < 0) {
      throw new BadRequestException('INAPAM visitors invalid');
    }

    if ((dto.inapamVisitors ?? 0) > dto.adults) {
      throw new BadRequestException('INAPAM visitors cannot exceed adults');
    }
  }

  private normalizeExtras(
    extras: Array<{ code: string; qty?: number }>,
  ): Array<{ code: string; qty: number }> {
    const map = new Map<string, number>();

    for (const extra of extras) {
      const code = extra.code?.trim().toUpperCase();

      if (!code) {
        throw new BadRequestException('Extra code is required');
      }

      const qty = extra.qty ?? 1;

      if (qty <= 0) {
        throw new BadRequestException(`Invalid quantity for extra ${code}`);
      }

      const current = map.get(code) ?? 0;
      map.set(code, current + qty);
    }

    return Array.from(map.entries()).map(([code, qty]) => ({
      code,
      qty,
    }));
  }

  private resolveExtras(
    packageExtras: Array<{
      id: string;
      code: string;
      priceMXN: number;
      currency: string;
      isRequired: boolean;
      translations: Array<{
        lang: string;
        name: string;
        description: string | null;
      }>;
    }>,
    selectedExtras: Array<{ code: string; qty: number }>,
    lang: string,
  ) {
    const selectedMap = new Map(selectedExtras.map((item) => [item.code, item.qty]));

    const requiredExtras = packageExtras
      .filter((extra) => extra.isRequired)
      .map((extra) => ({
        code: extra.code,
        qty: selectedMap.get(extra.code) ?? 1,
      }));

    const allRequestedCodes = new Set<string>([
      ...selectedExtras.map((item) => item.code),
      ...requiredExtras.map((item) => item.code),
    ]);

    const resolved: Array<{
      extraId: string | null;
      code: string;
      qty: number;
      priceMXN: number;
      currency: string;
      name: string | null;
      description: string | null;
    }> = [];

    for (const code of allRequestedCodes) {
      const extra = packageExtras.find((item) => item.code === code);

      if (!extra) {
        throw new BadRequestException(`Extra ${code} not found for this package`);
      }

      const qty =
        selectedMap.get(code) ??
        requiredExtras.find((item) => item.code === code)?.qty ??
        1;

      const translation =
        extra.translations.find((t) => t.lang === lang) ??
        extra.translations.find((t) => t.lang === 'es') ??
        extra.translations[0] ??
        null;

      resolved.push({
        extraId: extra.id,
        code: extra.code,
        qty,
        priceMXN: extra.priceMXN,
        currency: extra.currency,
        name: translation?.name ?? extra.code,
        description: translation?.description ?? null,
      });
    }

    return resolved;
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