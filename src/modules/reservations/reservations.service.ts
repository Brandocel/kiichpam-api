import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteDto } from './dto/quote.dto';

function clampMin0(n: number) {
  return n < 0 ? 0 : n;
}

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  private async getActivePackageByCode(code: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { code },
      include: {
        translations: true,
        extras: { where: { isActive: true }, include: { translations: true } },
      },
    });

    if (!pkg || !pkg.isActive) throw new NotFoundException('Package not found');
    return pkg;
  }

  private validateMax(pkg: any, dto: QuoteDto) {
    if (pkg.maxAdults != null && dto.adults > pkg.maxAdults) {
      throw new BadRequestException(`Max adults allowed: ${pkg.maxAdults}`);
    }
    if (pkg.maxChildren != null && dto.children > pkg.maxChildren) {
      throw new BadRequestException(`Max children allowed: ${pkg.maxChildren}`);
    }
    if (pkg.maxInfants != null && dto.infants > pkg.maxInfants) {
      throw new BadRequestException(`Max infants allowed: ${pkg.maxInfants}`);
    }
  }

  private async validateCoupon(couponCode: string | undefined, packageId: string, campaignCode?: string) {
    if (!couponCode) return null;

    const coupon = await this.prisma.coupon.findUnique({ where: { code: couponCode } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) throw new BadRequestException('Coupon not started');
    if (coupon.endsAt && now > coupon.endsAt) throw new BadRequestException('Coupon expired');

    if (coupon.maxUses && coupon.uses >= coupon.maxUses) throw new BadRequestException('Coupon max uses reached');

    if (coupon.packageId && coupon.packageId !== packageId) {
      throw new BadRequestException('Coupon not valid for this package');
    }
    if (coupon.campaignId && !campaignCode) {
      throw new BadRequestException('Coupon requires campaign');
    }

    return coupon;
  }

  private pickTranslation(list: any[], lang: string) {
    return list.find((t) => t.lang === lang) ?? list.find((t) => t.lang === 'es') ?? null;
  }

  private buildExtrasSnapshot(pkg: any, lang: string, selected?: { code: string; qty?: number }[]) {
    const selectedMap = new Map((selected ?? []).map((e) => [e.code, e.qty ?? 1]));

    // extras requeridos siempre se agregan
    const requiredExtras = pkg.extras.filter((e) => e.isRequired);
    for (const e of requiredExtras) {
      if (!selectedMap.has(e.code)) selectedMap.set(e.code, 1);
    }

    const picked: {
      code: string;
      qty: number;
      priceMXN: number;
      currency: string;
      name?: string;
      description?: string;
      extraId?: string;
    }[] = [];

    for (const [code, qty] of selectedMap.entries()) {
      const extra = pkg.extras.find((e) => e.code === code && e.isActive);
      if (!extra) {
        throw new BadRequestException(`Extra not valid for this package: ${code}`);
      }

      const tr = this.pickTranslation(extra.translations ?? [], lang);

      picked.push({
        extraId: extra.id,
        code: extra.code,
        qty,
        priceMXN: extra.priceMXN,
        currency: extra.currency ?? 'MXN',
        name: tr?.name ?? extra.code,
        description: tr?.description ?? null,
      });
    }

    const extrasTotal = picked.reduce((acc, e) => acc + e.priceMXN * e.qty, 0);
    return { picked, extrasTotal };
  }

  async quote(dto: QuoteDto) {
    const lang = dto.lang ?? 'es';
    const pkg = await this.getActivePackageByCode(dto.packageCode);

    // validar máximos
    this.validateMax(pkg, dto);

    // precio por tipo
    const subtotal =
      pkg.adultPriceMXN * dto.adults +
      pkg.childPriceMXN * dto.children +
      pkg.infantPriceMXN * dto.infants;

    // extras
    const { picked, extrasTotal } = this.buildExtrasSnapshot(pkg, lang, dto.extras);

    // cupón (tú decides si cupón aplica solo a personas o también a extras)
    // Aquí lo aplico sobre (subtotal + extrasTotal)
    const coupon = await this.validateCoupon(dto.couponCode, pkg.id, dto.campaignCode);

    const preDiscountTotal = subtotal + extrasTotal;

    let discount = 0;
    if (coupon) {
      if (coupon.type === 'PERCENT') discount = Math.floor(preDiscountTotal * (coupon.value / 100));
      if (coupon.type === 'FIXED') discount = coupon.value;
    }

    const total = clampMin0(preDiscountTotal - discount);

    // snapshot traducción (incluye/no incluye)
    const pkgTr = this.pickTranslation(pkg.translations ?? [], lang);

    return {
      packageCode: pkg.code,
      currency: pkg.currency,

      adults: dto.adults,
      children: dto.children,
      infants: dto.infants,

      peopleSubtotalMXN: subtotal,
      extrasMXN: extrasTotal,
      discountMXN: discount,
      totalMXN: total,

      couponApplied: coupon ? coupon.code : null,

      packageSnapshot: {
        lang,
        name: pkgTr?.name ?? pkg.code,
        description: pkgTr?.description ?? null,
        includes: pkgTr?.includes ?? [],
        excludes: pkgTr?.excludes ?? [],
        notes: pkgTr?.notes ?? [],
        ageRules: pkg.ageRules ?? null,
      },

      extras: picked.map((e) => ({
        code: e.code,
        qty: e.qty,
        unitPriceMXN: e.priceMXN,
        lineTotalMXN: e.priceMXN * e.qty,
        name: e.name,
        description: e.description,
      })),
    };
  }

  async create(dto: QuoteDto) {
    const lang = dto.lang ?? 'es';
    const pkg = await this.getActivePackageByCode(dto.packageCode);

    // validar máximos
    this.validateMax(pkg, dto);

    const quote = await this.quote(dto);

    const folio = `RSV-${Date.now()}`;

    // extras snapshot para guardar en DB
    const { picked, extrasTotal } = this.buildExtrasSnapshot(pkg, lang, dto.extras);
    const pkgTr = this.pickTranslation(pkg.translations ?? [], lang);

    const reservation = await this.prisma.reservation.create({
      data: {
        folio,
        packageId: pkg.id,
        visitDate: new Date(dto.visitDate),
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,

        campaignCode: dto.campaignCode ?? null,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        utmContent: dto.utmContent ?? null,
        utmTerm: dto.utmTerm ?? null,
        fbclid: dto.fbclid ?? null,
        ttclid: dto.ttclid ?? null,

        couponCode: dto.couponCode ?? null,

        subtotalMXN: quote.peopleSubtotalMXN,
        extrasMXN: extrasTotal,
        discountMXN: quote.discountMXN,
        totalMXN: quote.totalMXN,
        currency: pkg.currency,

        status: 'DRAFT',

        // ✅ snapshot del paquete
        snapshotLang: lang,
        snapshotName: pkgTr?.name ?? pkg.code,
        snapshotDescription: pkgTr?.description ?? null,
        snapshotIncludes: pkgTr?.includes ?? undefined,
        snapshotExcludes: pkgTr?.excludes ?? undefined,
        snapshotNotes: pkgTr?.notes ?? undefined,
        snapshotAgeRules: pkg.ageRules ?? undefined,

        // ✅ extras guardados
        extras: picked.length
          ? {
              create: picked.map((e) => ({
                extraId: e.extraId ?? null,
                code: e.code,
                qty: e.qty,
                priceMXN: e.priceMXN,
                currency: e.currency ?? 'MXN',
                name: e.name ?? null,
                description: e.description ?? null,
              })),
            }
          : undefined,
      },
      include: {
        extras: true,
        payments: true,
      },
    });

    return reservation;
  }

  async findByFolio(folio: string) {
    const res = await this.prisma.reservation.findUnique({
      where: { folio },
      include: { payments: true, extras: true, package: true },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    return res;
  }

  async updateContact(folio: string, data: any) {
    const res = await this.prisma.reservation.findUnique({ where: { folio } });
    if (!res) throw new NotFoundException('Reservation not found');

    return this.prisma.reservation.update({
      where: { folio },
      data: {
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        country: data.country ?? null,
        comments: data.comments ?? null,
      },
    });
  }
}
