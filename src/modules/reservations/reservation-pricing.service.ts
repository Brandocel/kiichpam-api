import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CouponsService } from '../coupons/coupons.service';
import { QuoteDto } from './dto/quote.dto';

type ResolvedExtra = {
  extraId: string | null;
  code: string;
  qty: number;
  priceMXN: number;
  currency: string;
  name: string | null;
  description: string | null;
};

type PrimaryCampaignForPricing = {
  code: string;
  stackable: boolean;
} | null;

@Injectable()
export class ReservationPricingService {
  private static readonly INAPAM_PERCENT = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly couponsService: CouponsService,
  ) {}

  async calculate(dto: QuoteDto) {
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

    this.validatePackageLimits(pkg, dto);

    const campaignResult = await this.campaignsService.resolveQuote({
      packageCode: normalizedPackageCode,
      adults: dto.adults,
      children: dto.children,
      infants: dto.infants,
      lang: normalizedLang,
      quoteAt: dto.visitDate,
      requestedCampaignCode: normalizedCampaignCode,
    });

    const primaryCampaign = await this.getPrimaryCampaignForPricing(
      campaignResult.primaryCampaignCode,
    );

    const canCombineInapamWithCampaign =
      this.canCombineInapamWithCampaign(primaryCampaign);

    const translation =
      pkg.translations.find((t) => t.lang === normalizedLang) ??
      pkg.translations.find((t) => t.lang === 'es') ??
      pkg.translations[0] ??
      null;

    const selectedExtras = this.normalizeExtras(dto.extras ?? []);
    const resolvedExtras = this.resolveExtras(
      pkg.extras,
      selectedExtras,
      normalizedLang,
    );

    const extrasMXN = resolvedExtras.reduce(
      (acc, item) => acc + item.priceMXN * item.qty,
      0,
    );

    const peopleSubtotalMXN = campaignResult.basePricing.total;
    const peopleSubtotalWithCampaignMXN = campaignResult.campaignPricing.total;

    const campaignDiscountMXN = Math.max(
      0,
      peopleSubtotalMXN - peopleSubtotalWithCampaignMXN,
    );

    const subtotalBeforeDiscountsMXN =
      peopleSubtotalWithCampaignMXN + extrasMXN;

    const payableAdults = campaignResult.campaignPricing.payableAdults;

    const requestedInapamVisitors = Math.min(
      dto.inapamVisitors ?? 0,
      payableAdults,
    );

    const effectiveAdultUnitPrice =
      payableAdults > 0
        ? Math.floor(campaignResult.campaignPricing.adultTotal / payableAdults)
        : 0;

    const inapamDiscountMXN =
      requestedInapamVisitors > 0 && canCombineInapamWithCampaign
        ? Math.floor(
            requestedInapamVisitors *
              effectiveAdultUnitPrice *
              (ReservationPricingService.INAPAM_PERCENT / 100),
          )
        : 0;

    const subtotalAfterInapam = Math.max(
      subtotalBeforeDiscountsMXN - inapamDiscountMXN,
      0,
    );

    let couponDiscountMXN = 0;
    let couponSummary: {
      code: string;
      type: string;
      value: number;
      scope: string;
    } | null = null;

    if (normalizedCouponCode) {
      const couponResult = await this.couponsService.calculateDiscount({
        couponCode: normalizedCouponCode,
        subtotalMXN: subtotalAfterInapam,
        packageCode: normalizedPackageCode,
        campaignCode: campaignResult.primaryCampaignCode ?? undefined,
      });

      couponDiscountMXN = couponResult.discountMXN;
      couponSummary = {
        code: couponResult.coupon.code,
        type: couponResult.coupon.type,
        value: couponResult.coupon.value,
        scope: couponResult.coupon.scope,
      };
    }

    const totalDiscountMXN =
      campaignDiscountMXN + inapamDiscountMXN + couponDiscountMXN;

    const totalMXN = Math.max(
      subtotalBeforeDiscountsMXN - inapamDiscountMXN - couponDiscountMXN,
      0,
    );

    const snapshotName =
      campaignResult.contentLayer.name ?? translation?.name ?? pkg.code;

    const snapshotDescription =
      campaignResult.contentLayer.description ??
      translation?.description ??
      null;

    const snapshotIncludes =
      campaignResult.contentLayer.includes ?? translation?.includes ?? [];

    const snapshotExcludes =
      campaignResult.contentLayer.excludes ?? translation?.excludes ?? [];

    const snapshotNotes =
      campaignResult.contentLayer.notes ?? translation?.notes ?? [];

    return {
      packageEntity: pkg,
      packageSummary: {
        id: pkg.id,
        code: pkg.code,
        currency: pkg.currency,
        coverMedia: campaignResult.contentLayer.image ?? pkg.coverMedia ?? null,
      },
      passengers: {
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
        payableAdults: campaignResult.campaignPricing.payableAdults,
        payableChildren: campaignResult.campaignPricing.payableChildren,
        payableInfants: campaignResult.campaignPricing.payableInfants,
      },
      selectedExtras: resolvedExtras,
      appliedCampaigns: campaignResult.appliedCampaigns,
      appliedCampaignCodes: campaignResult.appliedCampaignCodes,
      primaryCampaignCode: campaignResult.primaryCampaignCode,
      couponSummary,
      snapshot: {
        lang: normalizedLang,
        name: snapshotName,
        description: snapshotDescription,
        includes: snapshotIncludes,
        excludes: snapshotExcludes,
        notes: snapshotNotes,
        ageRules: pkg.ageRules ?? null,
      },
      pricing: {
        adultPriceMXN: pkg.adultPriceMXN,
        childPriceMXN: pkg.childPriceMXN,
        infantPriceMXN: pkg.infantPriceMXN,

        campaignAdultTotalMXN: campaignResult.campaignPricing.adultTotal,
        campaignChildTotalMXN: campaignResult.campaignPricing.childTotal,
        campaignInfantTotalMXN: campaignResult.campaignPricing.infantTotal,

        peopleSubtotalMXN,
        peopleSubtotalWithCampaignMXN,
        campaignDiscountMXN,

        extrasMXN,
        subtotalMXN: subtotalBeforeDiscountsMXN,

        inapamPercent: ReservationPricingService.INAPAM_PERCENT,
        inapamVisitors: requestedInapamVisitors,
        inapamDiscountMXN,

        couponDiscountMXN,
        discountMXN: totalDiscountMXN,
        totalMXN,
      },
      rules: {
        order: ['CAMPAIGN', 'EXTRAS', 'INAPAM', 'COUPON'],
        campaignResolvedByBackend: true,
        couponValidatedAgainstCampaign:
          !!normalizedCouponCode && !!campaignResult.primaryCampaignCode,

        primaryCampaignCode: campaignResult.primaryCampaignCode,
        primaryCampaignStackable: primaryCampaign?.stackable ?? null,
        inapamRequested: requestedInapamVisitors > 0,
        inapamCanCombineWithCampaign: canCombineInapamWithCampaign,
        inapamApplied: inapamDiscountMXN > 0,
      },
      breakdown: {
        basePeopleSubtotalMXN: peopleSubtotalMXN,
        peopleSubtotalWithCampaignMXN,
        extrasMXN,
        subtotalBeforeDiscountsMXN,
        subtotalAfterInapamMXN: subtotalAfterInapam,
        totalMXN,
      },
    };
  }

  private async getPrimaryCampaignForPricing(
    campaignCode?: string | null,
  ): Promise<PrimaryCampaignForPricing> {
    const code = campaignCode?.trim().toUpperCase();

    if (!code) {
      return null;
    }

    const campaign = await this.prisma.campaign.findUnique({
      where: { code },
      select: {
        code: true,
        stackable: true,
      },
    });

    if (!campaign) {
      return null;
    }

    return campaign;
  }

  private canCombineInapamWithCampaign(
    campaign: PrimaryCampaignForPricing,
  ): boolean {
    if (!campaign) {
      return true;
    }

    return campaign.stackable;
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

  private validatePackageLimits(
    pkg: {
      maxAdults: number | null;
      maxChildren: number | null;
      maxInfants: number | null;
    },
    dto: QuoteDto,
  ) {
    if (pkg.maxAdults != null && dto.adults > pkg.maxAdults) {
      throw new BadRequestException('Adults exceed package limit');
    }

    if (pkg.maxChildren != null && dto.children > pkg.maxChildren) {
      throw new BadRequestException('Children exceed package limit');
    }

    if (pkg.maxInfants != null && dto.infants > pkg.maxInfants) {
      throw new BadRequestException('Infants exceed package limit');
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
  ): ResolvedExtra[] {
    const selectedMap = new Map(
      selectedExtras.map((item) => [item.code, item.qty]),
    );

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

    const resolved: ResolvedExtra[] = [];

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
}