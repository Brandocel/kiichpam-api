import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Injectable()
export class PackagesService {
  constructor(private prisma: PrismaService) {}

  // helper: arma el objeto final
  private mapPackage(p: any) {
    return {
      id: p.id,
      code: p.code,
      isActive: p.isActive,

      // ✅ NUEVO
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
        translation: e.translations?.[0] ?? null,
      })),
    };
  }

  async findAll(lang = 'es') {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      include: {
        // ✅ NUEVO
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

  async findByCode(code: string, lang = 'es') {
    const p = await this.prisma.package.findUnique({
      where: { code },
      include: {
        // ✅ NUEVO
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
    });

    if (!p || !p.isActive) throw new NotFoundException('Package not found');
    return this.mapPackage(p);
  }

  // =========================
  // ✅ SET COVER IMAGE
  // =========================
  async setCoverImage(code: string, mediaId: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!media || !media.isActive) throw new NotFoundException('Media not found');

    if (media.kind !== 'IMAGE') {
      throw new BadRequestException('Media must be IMAGE');
    }

    const updated = await this.prisma.package.update({
      where: { code },
      data: { coverMediaId: mediaId },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: { where: { lang: 'es' }, select: { lang: true, name: true, description: true, includes: true, excludes: true, notes: true } },
        extras: { where: { isActive: true }, include: { translations: { where: { lang: 'es' }, select: { lang: true, name: true, description: true } } } },
      },
    });

    return {
      success: true,
      message: 'Cover image updated',
      data: this.mapPackage(updated),
    };
  }

  // =========================
  // ✅ REMOVE COVER IMAGE
  // =========================
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

  // =========================
  // ✅ UPDATE PACKAGE (opcional)
  // =========================
  async updateByCode(code: string, dto: UpdatePackageDto) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    const updated = await this.prisma.package.update({
      where: { code },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.adultPriceMXN !== undefined ? { adultPriceMXN: dto.adultPriceMXN } : {}),
        ...(dto.childPriceMXN !== undefined ? { childPriceMXN: dto.childPriceMXN } : {}),
        ...(dto.infantPriceMXN !== undefined ? { infantPriceMXN: dto.infantPriceMXN } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.maxAdults !== undefined ? { maxAdults: dto.maxAdults } : {}),
        ...(dto.maxChildren !== undefined ? { maxChildren: dto.maxChildren } : {}),
        ...(dto.maxInfants !== undefined ? { maxInfants: dto.maxInfants } : {}),
        ...(dto.ageRules !== undefined ? { ageRules: dto.ageRules as any } : {}),
      },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: { where: { lang: 'es' }, select: { lang: true, name: true, description: true, includes: true, excludes: true, notes: true } },
        extras: { where: { isActive: true }, include: { translations: { where: { lang: 'es' }, select: { lang: true, name: true, description: true } } } },
      },
    });

    return {
      success: true,
      message: 'Package updated',
      data: this.mapPackage(updated),
    };
  }

  // =========================
  // ✅ SOFT DELETE (opcional)
  // =========================
  async softDeleteByCode(code: string) {
    const pkg = await this.prisma.package.findUnique({ where: { code } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.prisma.package.update({
      where: { code },
      data: { isActive: false, coverMediaId: null },
    });

    return { success: true, message: 'Package disabled' };
  }

  async create(dto: CreatePackageDto) {
    // evitar duplicar idiomas
    if (dto.translations?.length) {
      const langs = dto.translations.map((t) => t.lang);
      if (new Set(langs).size !== langs.length) {
        throw new BadRequestException('Duplicated lang in translations');
      }
    }

    // evitar duplicar extras por code
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
                translations: e.translations?.length
                  ? {
                      create: e.translations.map((tr) => ({
                        lang: tr.lang,
                        name: tr.name,
                        description: tr.description ?? null,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        coverMedia: { select: { id: true, url: true, mimeType: true } },
        translations: { where: { lang: 'es' }, select: { lang: true, name: true, description: true, includes: true, excludes: true, notes: true } },
        extras: { include: { translations: true } },
      },
    });

    return {
      success: true,
      message: 'Package created',
      data: this.mapPackage(created),
    };
  }
}
