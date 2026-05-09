import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
  ) {}

  private mapPackage(p: any) {
    return {
      id: p.id,

      /**
       * Código corto para integraciones externas.
       * Ejemplo: 10000, 10001, 10002.
       */
      webCode: p.webCode,
      codigoWeb: p.webCode,

      code: p.code,
      isActive: p.isActive,

      image: p.coverMedia
        ? {
            id: p.coverMedia.id,
            url: p.coverMedia.url,
            mimeType: p.coverMedia.mimeType,
          }
        : null,

      adultPriceMXN: p.adultPriceMXN,
      childPriceMXN: p.childPriceMXN,
      infantPriceMXN: p.infantPriceMXN,
      inapamPriceMXN: p.inapamPriceMXN,

      currency: p.currency,

      maxAdults: p.maxAdults,
      maxChildren: p.maxChildren,
      maxInfants: p.maxInfants,

      ageRules: p.ageRules ?? null,

      translation: p.translations?.[0] ?? null,

      extras: (p.extras ?? []).map((e: any) => ({
        code: e.code,
        priceMXN: e.priceMXN,
        currency: e.currency,
        isRequired: e.isRequired,
        isActive: e.isActive,
        translation: e.translations?.[0] ?? null,
      })),
    };
  }

  private parseResolvedOptions(options?: {
    lang?: string;
    adults?: number;
    children?: number;
    infants?: number;
    quoteAt?: string;
    withCampaign?: boolean;
  }) {
    return {
      lang: options?.lang ?? 'es',
      adults: Number(options?.adults ?? 0),
      children: Number(options?.children ?? 0),
      infants: Number(options?.infants ?? 0),
      quoteAt: options?.quoteAt,
      withCampaign: options?.withCampaign ?? false,
    };
  }

  private parseWebCode(value: string | number) {
    const parsed =
      typeof value === 'number' ? value : Number(String(value).trim());

    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('Código web inválido');
    }

    if (parsed < 10000 || parsed > 99999) {
      throw new BadRequestException(
        'El código web debe ser un número de 5 dígitos',
      );
    }

    return parsed;
  }

  private async getBasePackageByCode(code: string, lang = 'es') {
    const p = await this.prisma.package.findUnique({
      where: { code },
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

    if (!p || !p.isActive) {
      throw new NotFoundException('Package not found');
    }

    return p;
  }

  private async getBasePackageByWebCode(webCode: number, lang = 'es') {
    const p = await this.prisma.package.findUnique({
      where: { webCode },
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

    if (!p || !p.isActive) {
      throw new NotFoundException('Package not found');
    }

    return p;
  }

  async findAll(lang = 'es') {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
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
      orderBy: { createdAt: 'desc' },
    });

    return packages.map((p) => this.mapPackage(p));
  }

  async findAllResolved(options?: {
    lang?: string;
    adults?: number;
    children?: number;
    infants?: number;
    quoteAt?: string;
    withCampaign?: boolean;
  }) {
    const { lang, adults, children, infants, quoteAt, withCampaign } =
      this.parseResolvedOptions(options);

    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
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
      orderBy: { createdAt: 'desc' },
    });

    const baseItems = packages.map((p) => this.mapPackage(p));

    if (!withCampaign) {
      return {
        success: true,
        data: baseItems,
      };
    }

    const resolvedItems = await Promise.all(
      baseItems.map(async (pkg) => {
        try {
          const quote = await this.campaignsService.quote({
            packageCode: pkg.code,
            adults,
            children,
            infants,
            lang,
            quoteAt,
          } as any);

          return {
            ...pkg,
            campaignApplied: (quote?.data?.appliedCampaigns?.length ?? 0) > 0,
            appliedCampaigns: quote?.data?.appliedCampaigns ?? [],
            effectivePackage: quote?.data?.effectivePackage ?? null,
            pricing: quote?.data?.pricing ?? null,
          };
        } catch {
          return {
            ...pkg,
            campaignApplied: false,
            appliedCampaigns: [],
            effectivePackage: null,
            pricing: null,
          };
        }
      }),
    );

    return {
      success: true,
      data: resolvedItems,
    };
  }

  async findByCode(code: string, lang = 'es') {
    const p = await this.getBasePackageByCode(code, lang);
    return this.mapPackage(p);
  }

  async findByWebCode(webCodeRaw: string | number, lang = 'es') {
    const webCode = this.parseWebCode(webCodeRaw);
    const p = await this.getBasePackageByWebCode(webCode, lang);

    return this.mapPackage(p);
  }

  async findByCodeResolved(
    code: string,
    options?: {
      lang?: string;
      adults?: number;
      children?: number;
      infants?: number;
      quoteAt?: string;
      withCampaign?: boolean;
    },
  ) {
    const { lang, adults, children, infants, quoteAt, withCampaign } =
      this.parseResolvedOptions(options);

    const basePackage = await this.getBasePackageByCode(code, lang);
    const mappedBase = this.mapPackage(basePackage);

    if (!withCampaign) {
      return {
        success: true,
        data: mappedBase,
      };
    }

    const quote = await this.campaignsService.quote({
      packageCode: mappedBase.code,
      adults,
      children,
      infants,
      lang,
      quoteAt,
    } as any);

    return {
      success: true,
      data: {
        ...mappedBase,
        campaignApplied: (quote?.data?.appliedCampaigns?.length ?? 0) > 0,
        appliedCampaigns: quote?.data?.appliedCampaigns ?? [],
        effectivePackage: quote?.data?.effectivePackage ?? null,
        pricing: quote?.data?.pricing ?? null,
      },
    };
  }

  async findByWebCodeResolved(
    webCodeRaw: string | number,
    options?: {
      lang?: string;
      adults?: number;
      children?: number;
      infants?: number;
      quoteAt?: string;
      withCampaign?: boolean;
    },
  ) {
    const webCode = this.parseWebCode(webCodeRaw);

    const { lang, adults, children, infants, quoteAt, withCampaign } =
      this.parseResolvedOptions(options);

    const basePackage = await this.getBasePackageByWebCode(webCode, lang);
    const mappedBase = this.mapPackage(basePackage);

    if (!withCampaign) {
      return {
        success: true,
        data: mappedBase,
      };
    }

    const quote = await this.campaignsService.quote({
      packageCode: mappedBase.code,
      adults,
      children,
      infants,
      lang,
      quoteAt,
    } as any);

    return {
      success: true,
      data: {
        ...mappedBase,
        campaignApplied: (quote?.data?.appliedCampaigns?.length ?? 0) > 0,
        appliedCampaigns: quote?.data?.appliedCampaigns ?? [],
        effectivePackage: quote?.data?.effectivePackage ?? null,
        pricing: quote?.data?.pricing ?? null,
      },
    };
  }

  async setCoverImage(code: string, mediaId: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });

    if (!media || !media.isActive) {
      throw new NotFoundException('Media not found');
    }

    if (media.kind !== 'IMAGE') {
      throw new BadRequestException('Media must be IMAGE');
    }

    const updated = await this.prisma.package.update({
      where: { code },
      data: { coverMediaId: mediaId },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: {
          where: { lang: 'es' },
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
              where: { lang: 'es' },
              select: { lang: true, name: true, description: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Cover image updated',
      data: this.mapPackage(updated),
    };
  }

  async removeCoverImage(code: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    const updated = await this.prisma.package.update({
      where: { code },
      data: { coverMediaId: null },
    });

    return {
      success: true,
      message: 'Cover image removed',
      data: { code: updated.code },
    };
  }

  async replaceByCode(code: string, dto: CreatePackageDto) {
    const pkg = await this.prisma.package.findUnique({
      where: { code },
    });

    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    if (!dto.code) {
      throw new BadRequestException('Package code is required');
    }

    if (dto.code !== code) {
      const existingCode = await this.prisma.package.findUnique({
        where: { code: dto.code },
      });

      if (existingCode) {
        throw new BadRequestException('Package code already exists');
      }
    }

    if (dto.translations?.length) {
      const langs = dto.translations.map((t) => t.lang);

      if (new Set(langs).size !== langs.length) {
        throw new BadRequestException('Duplicated lang in translations');
      }
    }

    if (dto.extras?.length) {
      const codes = dto.extras.map((e) => e.code);

      if (new Set(codes).size !== codes.length) {
        throw new BadRequestException('Duplicated extra code in extras');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const extras = await tx.packageExtra.findMany({
        where: { packageId: pkg.id },
        select: { id: true },
      });

      const extraIds = extras.map((extra) => extra.id);

      if (extraIds.length > 0) {
        await tx.packageExtraTranslation.deleteMany({
          where: {
            extraId: {
              in: extraIds,
            },
          },
        });
      }

      await tx.packageExtra.deleteMany({
        where: {
          packageId: pkg.id,
        },
      });

      await tx.packageTranslation.deleteMany({
        where: {
          packageId: pkg.id,
        },
      });

      return tx.package.update({
        where: { code },
        data: {
          code: dto.code,
          isActive: dto.isActive ?? true,

          adultPriceMXN: dto.adultPriceMXN,
          childPriceMXN: dto.childPriceMXN ?? 0,
          infantPriceMXN: dto.infantPriceMXN ?? 0,
          inapamPriceMXN: dto.inapamPriceMXN ?? null,

          currency: dto.currency ?? 'MXN',

          maxAdults: dto.maxAdults ?? null,
          maxChildren: dto.maxChildren ?? null,
          maxInfants: dto.maxInfants ?? null,

          ageRules: dto.ageRules
            ? {
                adultMin: dto.ageRules.adultMin,
                childMin: dto.ageRules.childMin,
                childMax: dto.ageRules.childMax,
                infantMax: dto.ageRules.infantMax,
              }
            : undefined,

          translations: dto.translations?.length
            ? {
                create: dto.translations.map((t) => ({
                  lang: t.lang,
                  name: t.name,
                  description: t.description ?? null,
                  includes: t.includes ?? undefined,
                  excludes: t.excludes ?? undefined,
                  notes: t.notes ?? undefined,
                })),
              }
            : undefined,

          extras: dto.extras?.length
            ? {
                create: dto.extras.map((e) => ({
                  code: e.code,
                  priceMXN: e.priceMXN,
                  currency: e.currency ?? 'MXN',
                  isRequired: e.isRequired ?? false,
                  isActive: e.isActive ?? true,
                  translations: e.translations?.length
                    ? {
                        create: e.translations.map((t) => ({
                          lang: t.lang,
                          name: t.name,
                          description: t.description ?? null,
                        })),
                      }
                    : undefined,
                })),
              }
            : undefined,
        },
        include: {
          coverMedia: { select: { id: true, url: true, mimeType: true } },
          translations: {
            where: { lang: 'es' },
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
                where: { lang: 'es' },
                select: { lang: true, name: true, description: true },
              },
            },
          },
        },
      });
    });

    return {
      success: true,
      message: 'Package replaced',
      data: this.mapPackage(updated),
    };
  }

  async updateByCode(code: string, dto: UpdatePackageDto) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    const updated = await this.prisma.package.update({
      where: { code },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),

        ...(dto.adultPriceMXN !== undefined
          ? { adultPriceMXN: dto.adultPriceMXN }
          : {}),

        ...(dto.childPriceMXN !== undefined
          ? { childPriceMXN: dto.childPriceMXN }
          : {}),

        ...(dto.infantPriceMXN !== undefined
          ? { infantPriceMXN: dto.infantPriceMXN }
          : {}),

        ...(dto.inapamPriceMXN !== undefined
          ? { inapamPriceMXN: dto.inapamPriceMXN }
          : {}),

        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),

        ...(dto.maxAdults !== undefined ? { maxAdults: dto.maxAdults } : {}),

        ...(dto.maxChildren !== undefined
          ? { maxChildren: dto.maxChildren }
          : {}),

        ...(dto.maxInfants !== undefined ? { maxInfants: dto.maxInfants } : {}),

        ...(dto.ageRules !== undefined ? { ageRules: dto.ageRules as any } : {}),
      },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: {
          where: { lang: 'es' },
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
              where: { lang: 'es' },
              select: { lang: true, name: true, description: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Package updated',
      data: this.mapPackage(updated),
    };
  }

  async softDeleteByCode(code: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.prisma.package.update({
      where: { code },
      data: { isActive: false, coverMediaId: null },
    });

    return {
      success: true,
      message: 'Package disabled',
    };
  }

  async create(dto: CreatePackageDto) {
    if (dto.translations?.length) {
      const langs = dto.translations.map((t) => t.lang);
      if (new Set(langs).size !== langs.length) {
        throw new BadRequestException('Duplicated lang in translations');
      }
    }

    if (dto.extras?.length) {
      const codes = dto.extras.map((e) => e.code);
      if (new Set(codes).size !== codes.length) {
        throw new BadRequestException('Duplicated extra code in extras');
      }
    }

    const created = await this.prisma.package.create({
      data: {
        code: dto.code,
        isActive: dto.isActive ?? true,

        adultPriceMXN: dto.adultPriceMXN,
        childPriceMXN: dto.childPriceMXN ?? 0,
        infantPriceMXN: dto.infantPriceMXN ?? 0,
        inapamPriceMXN: dto.inapamPriceMXN ?? null,

        currency: dto.currency ?? 'MXN',

        maxAdults: dto.maxAdults ?? null,
        maxChildren: dto.maxChildren ?? null,
        maxInfants: dto.maxInfants ?? null,

        ageRules: dto.ageRules
          ? {
              adultMin: dto.ageRules.adultMin,
              childMin: dto.ageRules.childMin,
              childMax: dto.ageRules.childMax,
              infantMax: dto.ageRules.infantMax,
            }
          : undefined,

        translations: dto.translations?.length
          ? {
              create: dto.translations.map((t) => ({
                lang: t.lang,
                name: t.name,
                description: t.description ?? null,
                includes: t.includes ?? undefined,
                excludes: t.excludes ?? undefined,
                notes: t.notes ?? undefined,
              })),
            }
          : undefined,

        extras: dto.extras?.length
          ? {
              create: dto.extras.map((e) => ({
                code: e.code,
                priceMXN: e.priceMXN,
                currency: e.currency ?? 'MXN',
                isRequired: e.isRequired ?? false,
                isActive: e.isActive ?? true,
                translations: e.translations?.length
                  ? {
                      create: e.translations.map((t) => ({
                        lang: t.lang,
                        name: t.name,
                        description: t.description ?? null,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: {
          where: { lang: 'es' },
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
              where: { lang: 'es' },
              select: { lang: true, name: true, description: true },
            },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Package created',
      data: this.mapPackage(created),
    };
  }
}