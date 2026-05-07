import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QuoteCampaignDto } from './dto/quote-campaign.dto';
import {
  CampaignAudience,
  CampaignCategory,
  CampaignEffectMode,
  CampaignRuleType,
  CampaignStatus,
} from '@prisma/client';

type PackageWithRelations = {
  id: string;
  code: string;
  isActive: boolean;
  adultPriceMXN: number;
  childPriceMXN: number;
  infantPriceMXN: number;
  inapamPriceMXN: number | null;
  currency: string;
  ageRules: any;
  maxAdults: number | null;
  maxChildren: number | null;
  maxInfants: number | null;
  coverMedia: null | {
    id: string;
    url: string;
    mimeType: string;
  };
  translations: Array<{
    lang: string;
    name: string;
    description: string | null;
    includes: any;
    excludes: any;
    notes: any;
  }>;
  extras: Array<{
    code: string;
    priceMXN: number;
    currency: string;
    isRequired: boolean;
    translations: Array<{
      lang: string;
      name: string;
      description: string | null;
    }>;
  }>;
};

type PriceComputation = {
  audience: CampaignAudience;
  adultTotal: number;
  childTotal: number;
  infantTotal: number;
  payableAdults: number;
  payableChildren: number;
  payableInfants: number;
};

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveStatus(
    startAt?: Date | null,
    endAt?: Date | null,
    isActive = true,
  ): CampaignStatus {
    if (!isActive) return CampaignStatus.DISABLED;
    if (!startAt && !endAt) return CampaignStatus.ACTIVE;

    const now = new Date();

    if (startAt && now < startAt) return CampaignStatus.SCHEDULED;
    if (endAt && now > endAt) return CampaignStatus.EXPIRED;

    return CampaignStatus.ACTIVE;
  }

  private validateDates(startAt?: string, endAt?: string) {
    if (!startAt && !endAt) return;

    if (!startAt || !endAt) {
      throw new BadRequestException('startAt and endAt must be sent together');
    }

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startAt or endAt');
    }

    if (start >= end) {
      throw new BadRequestException('startAt must be before endAt');
    }
  }

  private buildActiveDateWhere(quoteAt: Date) {
    return {
      AND: [
        {
          OR: [{ startAt: null }, { startAt: { lte: quoteAt } }],
        },
        {
          OR: [{ endAt: null }, { endAt: { gte: quoteAt } }],
        },
      ],
    };
  }

  private validateRule(data: {
    category: CampaignCategory;
    ruleType: CampaignRuleType;
    fixedAdultPriceMXN?: number | null;
    fixedChildPriceMXN?: number | null;
    fixedInfantPriceMXN?: number | null;
    fixedInapamPriceMXN?: number | null;
    discountPercent?: number | null;
    payQty?: number | null;
    takeQty?: number | null;
  }) {
    if (
      data.category === CampaignCategory.CONTENT &&
      data.ruleType === CampaignRuleType.BASE_PRICE
    ) {
      return;
    }

    switch (data.ruleType) {
      case CampaignRuleType.FIXED_PRICE:
        if (
          data.fixedAdultPriceMXN == null &&
          data.fixedChildPriceMXN == null &&
          data.fixedInfantPriceMXN == null &&
          data.fixedInapamPriceMXN == null
        ) {
          throw new BadRequestException(
            'FIXED_PRICE requires at least one fixed price',
          );
        }
        break;

      case CampaignRuleType.PERCENT_DISCOUNT:
        if (
          data.discountPercent == null ||
          data.discountPercent < 1 ||
          data.discountPercent > 100
        ) {
          throw new BadRequestException(
            'PERCENT_DISCOUNT requires discountPercent between 1 and 100',
          );
        }
        break;

      case CampaignRuleType.TWO_FOR_ONE: {
        const payQty = data.payQty ?? 1;
        const takeQty = data.takeQty ?? 2;

        if (payQty <= 0 || takeQty <= 0 || payQty >= takeQty) {
          throw new BadRequestException('Invalid TWO_FOR_ONE configuration');
        }
        break;
      }

      case CampaignRuleType.THREE_FOR_TWO: {
        const payQty = data.payQty ?? 2;
        const takeQty = data.takeQty ?? 3;

        if (payQty <= 0 || takeQty <= 0 || payQty >= takeQty) {
          throw new BadRequestException('Invalid THREE_FOR_TWO configuration');
        }
        break;
      }

      case CampaignRuleType.BASE_PRICE:
      default:
        break;
    }
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private uniqueStrings(items: string[]): string[] {
    return [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  }

  private removeItems(base: string[], toRemove: string[]): string[] {
    const removeSet = new Set(toRemove.map((x) => x.trim().toLowerCase()));

    return base.filter((x) => !removeSet.has(x.trim().toLowerCase()));
  }

  private mergeItems(
    base: string[],
    toAdd: string[],
    toRemove: string[],
  ): string[] {
    const removed = this.removeItems(base, toRemove);

    return this.uniqueStrings([...removed, ...toAdd]);
  }

  private applyNxMDetails(qty: number, payQty: number, takeQty: number) {
    if (qty <= 0) {
      return { payableUnits: 0 };
    }

    const groups = Math.floor(qty / takeQty);
    const remainder = qty % takeQty;
    const payableUnits = groups * payQty + remainder;

    return { payableUnits };
  }

  private mapCampaign(item: any) {
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      status: item.status,
      category: item.category,
      ruleType: item.ruleType,
      audience: item.audience,
      priority: item.priority,
      autoApply: item.autoApply,
      stackable: item.stackable,
      isActive: item.isActive,
      startAt: item.startAt,
      endAt: item.endAt,

      fixedAdultPriceMXN: item.fixedAdultPriceMXN,
      fixedChildPriceMXN: item.fixedChildPriceMXN,
      fixedInfantPriceMXN: item.fixedInfantPriceMXN,
      fixedInapamPriceMXN: item.fixedInapamPriceMXN,

      discountPercent: item.discountPercent,
      payQty: item.payQty,
      takeQty: item.takeQty,

      minAdults: item.minAdults,
      minChildren: item.minChildren,
      minInfants: item.minInfants,

      maxUses: item.maxUses,
      usedCount: item.usedCount,

      package: item.package
        ? {
            id: item.package.id,
            code: item.package.code,
          }
        : null,

      translations: (item.translations ?? []).map((t: any) => ({
        lang: t.lang,
        promoName: t.promoName,
        promoDescription: t.promoDescription,
        addIncludes: t.addIncludes ?? [],
        removeIncludes: t.removeIncludes ?? [],
        addExcludes: t.addExcludes ?? [],
        removeExcludes: t.removeExcludes ?? [],
        addNotes: t.addNotes ?? [],
        removeNotes: t.removeNotes ?? [],
        effectMode: t.effectMode,
        image: t.imageMedia
          ? {
              id: t.imageMedia.id,
              url: t.imageMedia.url,
              mimeType: t.imageMedia.mimeType,
            }
          : null,
      })),
    };
  }

  private passesMinRequirements(
    campaign: {
      minAdults: number | null;
      minChildren: number | null;
      minInfants: number | null;
      maxUses?: number | null;
      usedCount?: number;
    },
    adults: number,
    children: number,
    infants: number,
  ) {
    if ((campaign.minAdults ?? 0) > adults) return false;
    if ((campaign.minChildren ?? 0) > children) return false;
    if ((campaign.minInfants ?? 0) > infants) return false;

    if (
      campaign.maxUses != null &&
      campaign.usedCount != null &&
      campaign.usedCount >= campaign.maxUses
    ) {
      return false;
    }

    return true;
  }

  private sortCampaigns(items: any[]) {
    return [...items].sort(
      (a, b) => b.priority - a.priority || +b.createdAt - +a.createdAt,
    );
  }

  private chooseApplicableCampaigns(
    campaigns: any[],
    adults: number,
    children: number,
    infants: number,
  ) {
    const valid = campaigns.filter((campaign) =>
      this.passesMinRequirements(campaign, adults, children, infants),
    );

    const priceCandidates = this.sortCampaigns(
      valid.filter((c) => c.category === 'PRICE' || c.category === 'MIXED'),
    );

    const contentCandidates = this.sortCampaigns(
      valid.filter((c) => c.category === 'CONTENT' || c.category === 'MIXED'),
    );

    let chosenPriceCampaigns: any[] = [];

    const nonStackablePrice = priceCandidates.filter((c) => !c.stackable);

    if (nonStackablePrice.length > 0) {
      chosenPriceCampaigns = [nonStackablePrice[0]];
    } else {
      const allAudience = priceCandidates.filter(
        (c) => c.stackable && c.audience === CampaignAudience.ALL,
      );

      if (allAudience.length > 0) {
        chosenPriceCampaigns = [allAudience[0]];
      } else {
        const byAudience = new Map<CampaignAudience, any>();

        for (const candidate of priceCandidates.filter((c) => c.stackable)) {
          if (!byAudience.has(candidate.audience)) {
            byAudience.set(candidate.audience, candidate);
          }
        }

        chosenPriceCampaigns = Array.from(byAudience.values());
      }
    }

    const byId = new Map<string, any>();

    [...chosenPriceCampaigns, ...contentCandidates].forEach((c) => {
      byId.set(c.id, c);
    });

    return this.sortCampaigns([...byId.values()]);
  }

  private mergeRequestedCampaign(
    chosenCampaigns: any[],
    requestedCampaign: any,
  ) {
    const withoutDuplicated = chosenCampaigns.filter(
      (campaign) => campaign.id !== requestedCampaign.id,
    );

    if (requestedCampaign.stackable) {
      return this.sortCampaigns([requestedCampaign, ...withoutDuplicated]);
    }

    const requestedIsPrice =
      requestedCampaign.category === CampaignCategory.PRICE ||
      requestedCampaign.category === CampaignCategory.MIXED;

    const filtered = withoutDuplicated.filter((campaign) => {
      const currentIsPrice =
        campaign.category === CampaignCategory.PRICE ||
        campaign.category === CampaignCategory.MIXED;

      if (requestedIsPrice && currentIsPrice) return false;

      return true;
    });

    return this.sortCampaigns([requestedCampaign, ...filtered]);
  }

  private computeSingleCampaignPricing(params: {
    campaign: any;
    adultPriceMXN: number;
    childPriceMXN: number;
    infantPriceMXN: number;
    adults: number;
    children: number;
    infants: number;
  }): PriceComputation {
    const {
      campaign,
      adultPriceMXN,
      childPriceMXN,
      infantPriceMXN,
      adults,
      children,
      infants,
    } = params;

    const affectsAdults =
      campaign.audience === CampaignAudience.ALL ||
      campaign.audience === CampaignAudience.ADULT;

    const affectsChildren =
      campaign.audience === CampaignAudience.ALL ||
      campaign.audience === CampaignAudience.CHILD;

    const affectsInfants =
      campaign.audience === CampaignAudience.ALL ||
      campaign.audience === CampaignAudience.INFANT;

    let adultTotal = adults * adultPriceMXN;
    let childTotal = children * childPriceMXN;
    let infantTotal = infants * infantPriceMXN;

    let payableAdults = adults;
    let payableChildren = children;
    let payableInfants = infants;

    switch (campaign.ruleType) {
      case CampaignRuleType.BASE_PRICE:
        break;

      case CampaignRuleType.FIXED_PRICE:
        if (affectsAdults && campaign.fixedAdultPriceMXN != null) {
          adultTotal = adults * campaign.fixedAdultPriceMXN;
        }

        if (affectsChildren && campaign.fixedChildPriceMXN != null) {
          childTotal = children * campaign.fixedChildPriceMXN;
        }

        if (affectsInfants && campaign.fixedInfantPriceMXN != null) {
          infantTotal = infants * campaign.fixedInfantPriceMXN;
        }

        break;

      case CampaignRuleType.PERCENT_DISCOUNT: {
        const discount = (campaign.discountPercent ?? 0) / 100;

        if (affectsAdults) {
          adultTotal = Math.round(adultTotal * (1 - discount));
        }

        if (affectsChildren) {
          childTotal = Math.round(childTotal * (1 - discount));
        }

        if (affectsInfants) {
          infantTotal = Math.round(infantTotal * (1 - discount));
        }

        break;
      }

      case CampaignRuleType.TWO_FOR_ONE:
      case CampaignRuleType.THREE_FOR_TWO: {
        const payQty =
          campaign.payQty ??
          (campaign.ruleType === CampaignRuleType.TWO_FOR_ONE ? 1 : 2);

        const takeQty =
          campaign.takeQty ??
          (campaign.ruleType === CampaignRuleType.TWO_FOR_ONE ? 2 : 3);

        if (affectsAdults) {
          const result = this.applyNxMDetails(adults, payQty, takeQty);
          payableAdults = result.payableUnits;
          adultTotal = payableAdults * adultPriceMXN;
        }

        if (affectsChildren) {
          const result = this.applyNxMDetails(children, payQty, takeQty);
          payableChildren = result.payableUnits;
          childTotal = payableChildren * childPriceMXN;
        }

        if (affectsInfants) {
          const result = this.applyNxMDetails(infants, payQty, takeQty);
          payableInfants = result.payableUnits;
          infantTotal = payableInfants * infantPriceMXN;
        }

        break;
      }
    }

    return {
      audience: campaign.audience,
      adultTotal,
      childTotal,
      infantTotal,
      payableAdults,
      payableChildren,
      payableInfants,
    };
  }

  private calculateCampaignPricing(params: {
    campaigns: any[];
    adultPriceMXN: number;
    childPriceMXN: number;
    infantPriceMXN: number;
    adults: number;
    children: number;
    infants: number;
  }) {
    const {
      campaigns,
      adultPriceMXN,
      childPriceMXN,
      infantPriceMXN,
      adults,
      children,
      infants,
    } = params;

    let adultTotal = adults * adultPriceMXN;
    let childTotal = children * childPriceMXN;
    let infantTotal = infants * infantPriceMXN;

    let payableAdults = adults;
    let payableChildren = children;
    let payableInfants = infants;

    const priceCampaigns = campaigns.filter(
      (c) => c.category === 'PRICE' || c.category === 'MIXED',
    );

    for (const campaign of priceCampaigns) {
      const result = this.computeSingleCampaignPricing({
        campaign,
        adultPriceMXN,
        childPriceMXN,
        infantPriceMXN,
        adults,
        children,
        infants,
      });

      if (
        campaign.audience === CampaignAudience.ALL ||
        campaign.audience === CampaignAudience.ADULT
      ) {
        adultTotal = result.adultTotal;
        payableAdults = result.payableAdults;
      }

      if (
        campaign.audience === CampaignAudience.ALL ||
        campaign.audience === CampaignAudience.CHILD
      ) {
        childTotal = result.childTotal;
        payableChildren = result.payableChildren;
      }

      if (
        campaign.audience === CampaignAudience.ALL ||
        campaign.audience === CampaignAudience.INFANT
      ) {
        infantTotal = result.infantTotal;
        payableInfants = result.payableInfants;
      }
    }

    return {
      adultTotal,
      childTotal,
      infantTotal,
      payableAdults,
      payableChildren,
      payableInfants,
      total: adultTotal + childTotal + infantTotal,
    };
  }

  private applyContentLayer(params: {
    basePackage: PackageWithRelations;
    campaigns: any[];
    lang: string;
  }) {
    const { basePackage, campaigns, lang } = params;
    const translation = basePackage.translations?.[0] ?? null;

    let name = translation?.name ?? null;
    let description = translation?.description ?? null;
    let includes = this.toStringArray(translation?.includes);
    let excludes = this.toStringArray(translation?.excludes);
    let notes = this.toStringArray(translation?.notes);
    let image = basePackage.coverMedia ?? null;

    for (const campaign of campaigns) {
      const tr =
        (campaign.translations ?? []).find((t: any) => t.lang === lang) ?? null;

      if (!tr) continue;

      if (tr.promoName) {
        name = tr.promoName;
      }

      if (tr.promoDescription) {
        description = tr.promoDescription;
      }

      if (tr.effectMode === CampaignEffectMode.REPLACE) {
        includes = this.uniqueStrings(this.toStringArray(tr.addIncludes));
        excludes = this.uniqueStrings(this.toStringArray(tr.addExcludes));
        notes = this.uniqueStrings(this.toStringArray(tr.addNotes));
      } else {
        includes = this.mergeItems(
          includes,
          this.toStringArray(tr.addIncludes),
          this.toStringArray(tr.removeIncludes),
        );

        excludes = this.mergeItems(
          excludes,
          this.toStringArray(tr.addExcludes),
          this.toStringArray(tr.removeExcludes),
        );

        notes = this.mergeItems(
          notes,
          this.toStringArray(tr.addNotes),
          this.toStringArray(tr.removeNotes),
        );
      }

      if (tr.imageMedia) {
        image = {
          id: tr.imageMedia.id,
          url: tr.imageMedia.url,
          mimeType: tr.imageMedia.mimeType,
        };
      }
    }

    return {
      name,
      description,
      includes,
      excludes,
      notes,
      image,
    };
  }

  private async getBasePackage(packageCode: string, lang: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { code: packageCode },
      include: {
        coverMedia: {
          select: { id: true, url: true, mimeType: true },
        },
        translations: {
          where: { lang },
          select: {
            lang: true,
            name: true,
            description: true,
            includes: true,
            excludes: true,
            notes: true,
          },
        },
        extras: {
          where: { isActive: true },
          include: {
            translations: {
              where: { lang },
              select: { lang: true, name: true, description: true },
            },
          },
        },
      },
    });

    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Package not found');
    }

    return pkg as PackageWithRelations;
  }

  async resolveQuote(params: {
    packageCode: string;
    lang?: string;
    adults?: number;
    children?: number;
    infants?: number;
    quoteAt?: string | Date;
    requestedCampaignCode?: string;
  }) {
    const quoteAt =
      params.quoteAt instanceof Date
        ? params.quoteAt
        : params.quoteAt
          ? new Date(params.quoteAt)
          : new Date();

    if (Number.isNaN(quoteAt.getTime())) {
      throw new BadRequestException('Invalid quoteAt');
    }

    const lang = params.lang ?? 'es';
    const adults = Math.max(0, Number(params.adults ?? 0));
    const children = Math.max(0, Number(params.children ?? 0));
    const infants = Math.max(0, Number(params.infants ?? 0));
    const packageCode = params.packageCode.trim().toUpperCase();
    const requestedCampaignCode = params.requestedCampaignCode
      ?.trim()
      .toUpperCase();

    const pkg = await this.getBasePackage(packageCode, lang);

    const basePricing = {
      adultTotal: adults * pkg.adultPriceMXN,
      childTotal: children * pkg.childPriceMXN,
      infantTotal: infants * pkg.infantPriceMXN,
      payableAdults: adults,
      payableChildren: children,
      payableInfants: infants,
      total:
        adults * pkg.adultPriceMXN +
        children * pkg.childPriceMXN +
        infants * pkg.infantPriceMXN,
    };

    const activeAutoCampaigns = await this.prisma.campaign.findMany({
      where: {
        isActive: true,
        status: CampaignStatus.ACTIVE,
        autoApply: true,
        OR: [{ packageId: pkg.id }, { packageId: null }],
        ...this.buildActiveDateWhere(quoteAt),
      },
      include: {
        package: {
          select: { id: true, code: true },
        },
        translations: {
          include: {
            imageMedia: {
              select: { id: true, url: true, mimeType: true },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    let chosenCampaigns = this.chooseApplicableCampaigns(
      activeAutoCampaigns,
      adults,
      children,
      infants,
    );

    if (requestedCampaignCode) {
      const requestedCampaign = await this.prisma.campaign.findFirst({
        where: {
          code: requestedCampaignCode,
          isActive: true,
          status: CampaignStatus.ACTIVE,
          OR: [{ packageId: pkg.id }, { packageId: null }],
          ...this.buildActiveDateWhere(quoteAt),
        },
        include: {
          package: {
            select: { id: true, code: true },
          },
          translations: {
            include: {
              imageMedia: {
                select: { id: true, url: true, mimeType: true },
              },
            },
          },
        },
      });

      if (
        !requestedCampaign ||
        !this.passesMinRequirements(
          requestedCampaign,
          adults,
          children,
          infants,
        )
      ) {
        throw new BadRequestException(
          'Requested campaign is not active or not applicable',
        );
      }

      chosenCampaigns = this.mergeRequestedCampaign(
        chosenCampaigns,
        requestedCampaign,
      );
    }

    const campaignPricing = this.calculateCampaignPricing({
      campaigns: chosenCampaigns,
      adultPriceMXN: pkg.adultPriceMXN,
      childPriceMXN: pkg.childPriceMXN,
      infantPriceMXN: pkg.infantPriceMXN,
      adults,
      children,
      infants,
    });

    const contentLayer = this.applyContentLayer({
      basePackage: pkg,
      campaigns: chosenCampaigns.filter(
        (c) => c.category === 'CONTENT' || c.category === 'MIXED',
      ),
      lang,
    });

    return {
      packageEntity: pkg,
      basePricing,
      campaignPricing,
      savingsMXN: Math.max(0, basePricing.total - campaignPricing.total),
      appliedCampaigns: chosenCampaigns.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        category: c.category,
        ruleType: c.ruleType,
        priority: c.priority,
        audience: c.audience,
        stackable: c.stackable,
        autoApply: c.autoApply,
        fixedAdultPriceMXN: c.fixedAdultPriceMXN,
        fixedChildPriceMXN: c.fixedChildPriceMXN,
        fixedInfantPriceMXN: c.fixedInfantPriceMXN,
        fixedInapamPriceMXN: c.fixedInapamPriceMXN,
        package: c.package
          ? {
              id: c.package.id,
              code: c.package.code,
            }
          : null,
      })),
      appliedCampaignCodes: chosenCampaigns.map((c) => c.code),
      primaryCampaignCode: chosenCampaigns[0]?.code ?? null,
      contentLayer,
      effectiveUnitPrices: {
        adultPriceMXN:
          adults > 0
            ? Math.round(campaignPricing.adultTotal / Math.max(adults, 1))
            : pkg.adultPriceMXN,
        childPriceMXN:
          children > 0
            ? Math.round(campaignPricing.childTotal / Math.max(children, 1))
            : pkg.childPriceMXN,
        infantPriceMXN:
          infants > 0
            ? Math.round(campaignPricing.infantTotal / Math.max(infants, 1))
            : pkg.infantPriceMXN,
        inapamPriceMXN: pkg.inapamPriceMXN,
      },
    };
  }

  async quote(dto: QuoteCampaignDto & { campaignCode?: string }) {
    const result = await this.resolveQuote({
      packageCode: dto.packageCode,
      adults: dto.adults ?? 0,
      children: dto.children ?? 0,
      infants: dto.infants ?? 0,
      lang: dto.lang ?? 'es',
      quoteAt: dto.quoteAt,
      requestedCampaignCode: dto.campaignCode,
    });

    return {
      success: true,
      data: {
        packageCode: result.packageEntity.code,
        basePackage: {
          id: result.packageEntity.id,
          code: result.packageEntity.code,
          currency: result.packageEntity.currency,
          adultPriceMXN: result.packageEntity.adultPriceMXN,
          childPriceMXN: result.packageEntity.childPriceMXN,
          infantPriceMXN: result.packageEntity.infantPriceMXN,
          inapamPriceMXN: result.packageEntity.inapamPriceMXN,
          image: result.packageEntity.coverMedia,
          translation: result.packageEntity.translations?.[0] ?? null,
        },
        appliedCampaigns: result.appliedCampaigns,
        appliedCampaignCodes: result.appliedCampaignCodes,
        primaryCampaignCode: result.primaryCampaignCode,
        effectivePackage: {
          code: result.packageEntity.code,
          currency: result.packageEntity.currency,
          image: result.contentLayer.image,
          name: result.contentLayer.name,
          description: result.contentLayer.description,
          includes: result.contentLayer.includes,
          excludes: result.contentLayer.excludes,
          notes: result.contentLayer.notes,
          adultPriceMXN: result.effectiveUnitPrices.adultPriceMXN,
          childPriceMXN: result.effectiveUnitPrices.childPriceMXN,
          infantPriceMXN: result.effectiveUnitPrices.infantPriceMXN,
          inapamPriceMXN: result.effectiveUnitPrices.inapamPriceMXN,
        },
        pricing: {
          base: result.basePricing,
          campaign: result.campaignPricing,
          savingsMXN: result.savingsMXN,
          totalMXN: result.campaignPricing.total,
        },
      },
    };
  }

  async findAll(packageCode?: string) {
    const normalizedPackageCode = packageCode?.trim().toUpperCase();

    const items = await this.prisma.campaign.findMany({
      where: normalizedPackageCode
        ? {
            OR: [
              {
                package: {
                  code: normalizedPackageCode,
                },
              },
              {
                packageId: null,
              },
            ],
          }
        : undefined,
      include: {
        package: {
          select: { id: true, code: true },
        },
        translations: {
          include: {
            imageMedia: {
              select: { id: true, url: true, mimeType: true },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      data: items.map((item) => this.mapCampaign(item)),
    };
  }

  async findOneByCode(code: string) {
    const item = await this.prisma.campaign.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        package: {
          select: { id: true, code: true },
        },
        translations: {
          include: {
            imageMedia: {
              select: { id: true, url: true, mimeType: true },
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Campaign not found');

    return {
      success: true,
      data: this.mapCampaign(item),
    };
  }

  async findActiveByPackageCode(packageCode: string) {
    const now = new Date();
    const normalizedPackageCode = packageCode.trim().toUpperCase();

    const pkg = await this.prisma.package.findUnique({
      where: { code: normalizedPackageCode },
    });

    if (!pkg) throw new NotFoundException('Package not found');

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        isActive: true,
        status: CampaignStatus.ACTIVE,
        OR: [{ packageId: pkg.id }, { packageId: null }],
        ...this.buildActiveDateWhere(now),
      },
      include: {
        package: {
          select: { id: true, code: true },
        },
        translations: {
          include: {
            imageMedia: {
              select: { id: true, url: true, mimeType: true },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      data: campaigns.map((item) => this.mapCampaign(item)),
    };
  }

  async create(dto: CreateCampaignDto) {
    this.validateDates(dto.startAt, dto.endAt);

    const category = (dto.category ?? 'PRICE') as CampaignCategory;
    const ruleType = (dto.ruleType ?? 'BASE_PRICE') as CampaignRuleType;

    this.validateRule({
      category,
      ruleType,
      fixedAdultPriceMXN: dto.fixedAdultPriceMXN ?? null,
      fixedChildPriceMXN: dto.fixedChildPriceMXN ?? null,
      fixedInfantPriceMXN: dto.fixedInfantPriceMXN ?? null,
      fixedInapamPriceMXN: dto.fixedInapamPriceMXN ?? null,
      discountPercent: dto.discountPercent ?? null,
      payQty: dto.payQty ?? null,
      takeQty: dto.takeQty ?? null,
    });

    if (dto.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: dto.packageId },
      });

      if (!pkg) throw new NotFoundException('Package not found');
    }

    if (dto.translations?.length) {
      const langs = dto.translations.map((t) => t.lang);

      if (new Set(langs).size !== langs.length) {
        throw new BadRequestException(
          'Duplicated lang in campaign translations',
        );
      }
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    const isActive = dto.isActive ?? true;
    const status = this.resolveStatus(startAt, endAt, isActive);

    const created = await this.prisma.campaign.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name,
        source: dto.source ?? null,
        description: dto.description ?? null,
        isActive,
        packageId: dto.packageId ?? null,
        status,
        category,
        ruleType,
        audience: (dto.audience ?? 'ALL') as CampaignAudience,
        startAt,
        endAt,
        priority: dto.priority ?? 0,
        autoApply: dto.autoApply ?? true,
        stackable: dto.stackable ?? false,

        fixedAdultPriceMXN: dto.fixedAdultPriceMXN ?? null,
        fixedChildPriceMXN: dto.fixedChildPriceMXN ?? null,
        fixedInfantPriceMXN: dto.fixedInfantPriceMXN ?? null,
        fixedInapamPriceMXN: dto.fixedInapamPriceMXN ?? null,

        discountPercent: dto.discountPercent ?? null,

        payQty:
          ruleType === CampaignRuleType.TWO_FOR_ONE
            ? 1
            : ruleType === CampaignRuleType.THREE_FOR_TWO
              ? 2
              : dto.payQty ?? null,

        takeQty:
          ruleType === CampaignRuleType.TWO_FOR_ONE
            ? 2
            : ruleType === CampaignRuleType.THREE_FOR_TWO
              ? 3
              : dto.takeQty ?? null,

        minAdults: dto.minAdults ?? null,
        minChildren: dto.minChildren ?? null,
        minInfants: dto.minInfants ?? null,
        maxUses: dto.maxUses ?? null,

        translations: dto.translations?.length
          ? {
              create: dto.translations.map((t) => ({
                lang: t.lang,
                promoName: t.promoName ?? null,
                promoDescription: t.promoDescription ?? null,
                addIncludes: t.addIncludes ?? undefined,
                removeIncludes: t.removeIncludes ?? undefined,
                addExcludes: t.addExcludes ?? undefined,
                removeExcludes: t.removeExcludes ?? undefined,
                addNotes: t.addNotes ?? undefined,
                removeNotes: t.removeNotes ?? undefined,
                imageMediaId: t.imageMediaId ?? null,
                effectMode:
                  (t.effectMode ?? 'MERGE') as unknown as CampaignEffectMode,
              })),
            }
          : undefined,
      },
      include: {
        package: {
          select: { id: true, code: true },
        },
        translations: {
          include: {
            imageMedia: {
              select: { id: true, url: true, mimeType: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Campaign created',
      data: this.mapCampaign(created),
    };
  }

  async updateByCode(code: string, dto: UpdateCampaignDto) {
    const normalizedCode = code.trim().toUpperCase();

    const campaign = await this.prisma.campaign.findUnique({
      where: { code: normalizedCode },
      include: { translations: true },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    const nextStartAt =
      dto.startAt !== undefined
        ? dto.startAt
          ? new Date(dto.startAt)
          : null
        : campaign.startAt;

    const nextEndAt =
      dto.endAt !== undefined
        ? dto.endAt
          ? new Date(dto.endAt)
          : null
        : campaign.endAt;

    if (dto.startAt !== undefined || dto.endAt !== undefined) {
      if ((dto.startAt && !dto.endAt) || (!dto.startAt && dto.endAt)) {
        throw new BadRequestException('startAt and endAt must be sent together');
      }

      if (nextStartAt && nextEndAt && nextStartAt >= nextEndAt) {
        throw new BadRequestException('startAt must be before endAt');
      }
    }

    const mergedCategory = (dto.category ??
      campaign.category) as CampaignCategory;

    const mergedRuleType = (dto.ruleType ??
      campaign.ruleType) as CampaignRuleType;

    this.validateRule({
      category: mergedCategory,
      ruleType: mergedRuleType,

      fixedAdultPriceMXN:
        dto.fixedAdultPriceMXN !== undefined
          ? dto.fixedAdultPriceMXN
          : campaign.fixedAdultPriceMXN,

      fixedChildPriceMXN:
        dto.fixedChildPriceMXN !== undefined
          ? dto.fixedChildPriceMXN
          : campaign.fixedChildPriceMXN,

      fixedInfantPriceMXN:
        dto.fixedInfantPriceMXN !== undefined
          ? dto.fixedInfantPriceMXN
          : campaign.fixedInfantPriceMXN,

      fixedInapamPriceMXN:
        dto.fixedInapamPriceMXN !== undefined
          ? dto.fixedInapamPriceMXN
          : campaign.fixedInapamPriceMXN,

      discountPercent:
        dto.discountPercent !== undefined
          ? dto.discountPercent
          : campaign.discountPercent,

      payQty: dto.payQty !== undefined ? dto.payQty : campaign.payQty,
      takeQty: dto.takeQty !== undefined ? dto.takeQty : campaign.takeQty,
    });

    if (dto.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: dto.packageId },
      });

      if (!pkg) throw new NotFoundException('Package not found');
    }

    const status = this.resolveStatus(
      nextStartAt,
      nextEndAt,
      dto.isActive ?? campaign.isActive,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedCampaign = await tx.campaign.update({
        where: { code: normalizedCode },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.packageId !== undefined
            ? { packageId: dto.packageId || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.category !== undefined
            ? { category: dto.category as CampaignCategory }
            : {}),
          ...(dto.ruleType !== undefined
            ? { ruleType: dto.ruleType as CampaignRuleType }
            : {}),
          ...(dto.audience !== undefined
            ? { audience: dto.audience as CampaignAudience }
            : {}),
          ...(dto.startAt !== undefined ? { startAt: nextStartAt } : {}),
          ...(dto.endAt !== undefined ? { endAt: nextEndAt } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.autoApply !== undefined ? { autoApply: dto.autoApply } : {}),
          ...(dto.stackable !== undefined ? { stackable: dto.stackable } : {}),

          ...(dto.fixedAdultPriceMXN !== undefined
            ? { fixedAdultPriceMXN: dto.fixedAdultPriceMXN }
            : {}),

          ...(dto.fixedChildPriceMXN !== undefined
            ? { fixedChildPriceMXN: dto.fixedChildPriceMXN }
            : {}),

          ...(dto.fixedInfantPriceMXN !== undefined
            ? { fixedInfantPriceMXN: dto.fixedInfantPriceMXN }
            : {}),

          ...(dto.fixedInapamPriceMXN !== undefined
            ? { fixedInapamPriceMXN: dto.fixedInapamPriceMXN }
            : {}),

          ...(dto.discountPercent !== undefined
            ? { discountPercent: dto.discountPercent }
            : {}),

          ...(dto.payQty !== undefined ? { payQty: dto.payQty } : {}),
          ...(dto.takeQty !== undefined ? { takeQty: dto.takeQty } : {}),
          ...(dto.minAdults !== undefined ? { minAdults: dto.minAdults } : {}),
          ...(dto.minChildren !== undefined
            ? { minChildren: dto.minChildren }
            : {}),
          ...(dto.minInfants !== undefined ? { minInfants: dto.minInfants } : {}),
          ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),

          status,
        },
      });

      if (dto.translations) {
        await tx.campaignTranslation.deleteMany({
          where: { campaignId: updatedCampaign.id },
        });

        if (dto.translations.length > 0) {
          await tx.campaignTranslation.createMany({
            data: dto.translations.map((t) => ({
              campaignId: updatedCampaign.id,
              lang: t.lang,
              promoName: t.promoName ?? null,
              promoDescription: t.promoDescription ?? null,
              addIncludes: t.addIncludes ?? undefined,
              removeIncludes: t.removeIncludes ?? undefined,
              addExcludes: t.addExcludes ?? undefined,
              removeExcludes: t.removeExcludes ?? undefined,
              addNotes: t.addNotes ?? undefined,
              removeNotes: t.removeNotes ?? undefined,
              imageMediaId: t.imageMediaId ?? null,
              effectMode:
                (t.effectMode ?? 'MERGE') as unknown as CampaignEffectMode,
            })),
          });
        }
      }

      return tx.campaign.findUnique({
        where: { code: normalizedCode },
        include: {
          package: {
            select: { id: true, code: true },
          },
          translations: {
            include: {
              imageMedia: {
                select: { id: true, url: true, mimeType: true },
              },
            },
          },
        },
      });
    });

    return {
      success: true,
      message: 'Campaign updated',
      data: this.mapCampaign(updated),
    };
  }

  async enableByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();

    const campaign = await this.prisma.campaign.findUnique({
      where: { code: normalizedCode },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    const status = this.resolveStatus(campaign.startAt, campaign.endAt, true);

    const updated = await this.prisma.campaign.update({
      where: { code: normalizedCode },
      data: {
        isActive: true,
        status,
      },
    });

    return {
      success: true,
      message: 'Campaign enabled',
      data: updated,
    };
  }

  async disableByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();

    const campaign = await this.prisma.campaign.findUnique({
      where: { code: normalizedCode },
    });

    if (!campaign) throw new NotFoundException('Campaign not found');

    const updated = await this.prisma.campaign.update({
      where: { code: normalizedCode },
      data: {
        isActive: false,
        status: CampaignStatus.DISABLED,
      },
    });

    return {
      success: true,
      message: 'Campaign disabled',
      data: updated,
    };
  }

  async refreshCampaignStatuses() {
    const items = await this.prisma.campaign.findMany({
      select: {
        id: true,
        startAt: true,
        endAt: true,
        isActive: true,
        status: true,
      },
    });

    for (const item of items) {
      const nextStatus = this.resolveStatus(
        item.startAt,
        item.endAt,
        item.isActive,
      );

      if (nextStatus !== item.status) {
        await this.prisma.campaign.update({
          where: { id: item.id },
          data: { status: nextStatus },
        });
      }
    }

    return { success: true };
  }

  async incrementUsage(codes: string[]) {
    if (!codes.length) return;

    await this.prisma.campaign.updateMany({
      where: {
        code: {
          in: codes.map((item) => item.trim().toUpperCase()),
        },
      },
      data: {
        usedCount: {
          increment: 1,
        } as any,
      },
    });
  }
}