import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaKind, PromotionSectionType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ReorderPromotionsDto } from './dto/reorder-promotions.dto';
import { UpsertPromotionLanguageDto } from './dto/upsert-promotion-language.dto';

export type PromotionImageUploadFile = {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  filename?: string;
};

type PromotionTranslationInput = {
  lang: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  buttonText?: string | null;
};

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxFileSize = 5 * 1024 * 1024;

  private getNow() {
    return new Date();
  }

  private normalizeLang(lang?: string) {
    return (lang ?? 'es').trim().toLowerCase() || 'es';
  }

  private getMediaSelect() {
    return {
      id: true,
      kind: true,
      mimeType: true,
      ext: true,
      size: true,
      originalName: true,
      filename: true,
      path: true,
      url: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private getPromotionInclude(lang = 'es') {
    const mediaSelect = this.getMediaSelect();
    const normalizedLang = this.normalizeLang(lang);

    return {
      translations: {
        where: {
          lang: normalizedLang,
        },
        select: {
          id: true,
          lang: true,
          title: true,
          subtitle: true,
          description: true,
          buttonText: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      package: {
        include: {
          translations: {
            where: {
              lang: normalizedLang,
            },
          },
          coverMedia: {
            select: mediaSelect,
          },
        },
      },
      campaign: {
        include: {
          translations: {
            where: {
              lang: normalizedLang,
            },
            include: {
              imageMedia: {
                select: mediaSelect,
              },
            },
          },
        },
      },
      imageMedia: {
        select: mediaSelect,
      },
    };
  }

  private mapPromotion(promotion: any) {
    const translation = promotion.translations?.[0] ?? null;

    return {
      ...promotion,

      title: translation?.title ?? promotion.title,
      subtitle: translation?.subtitle ?? promotion.subtitle,
      description: translation?.description ?? promotion.description,
      buttonText: translation?.buttonText ?? promotion.buttonText,

      translation,

      translations: undefined,
    };
  }

  private mapPublicResponse(data: {
    featuredPromotion: any | null;
    promotions: any[];
  }) {
    return {
      featuredPromotion: data.featuredPromotion
        ? this.mapPromotion(data.featuredPromotion)
        : null,
      promotions: data.promotions.map((promotion) =>
        this.mapPromotion(promotion),
      ),
    };
  }

  private normalizeDate(value?: string | null) {
    if (!value) return null;
    return new Date(value);
  }

  private validateDateRange(startAt?: string | null, endAt?: string | null) {
    if (!startAt || !endAt) return;

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (start > end) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de finalización.',
      );
    }
  }

  private buildDateFilter() {
    const now = this.getNow();

    return {
      AND: [
        {
          OR: [{ startAt: null }, { startAt: { lte: now } }],
        },
        {
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
      ],
    };
  }

  private getExtFromFilename(filename: string) {
    const parts = filename.split('.');

    if (parts.length <= 1) {
      return '';
    }

    return parts.pop()?.toLowerCase() || '';
  }

  private validateUploadedImage(file: PromotionImageUploadFile) {
    if (!file) {
      throw new BadRequestException('La imagen es obligatoria.');
    }

    if (!file.buffer) {
      throw new BadRequestException(
        `La imagen ${file.originalname} no contiene datos en memoria.`,
      );
    }

    if (!file.filename) {
      throw new BadRequestException(
        `La imagen ${file.originalname} no tiene nombre generado.`,
      );
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `La imagen ${file.originalname} supera el límite de 5 MB.`,
      );
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de imagen no permitido: ${file.mimetype}`,
      );
    }
  }

  private async deleteOldImageIfPossible(oldImageMediaId?: string | null) {
    if (!oldImageMediaId) return;

    try {
      await this.prisma.mediaAsset.delete({
        where: {
          id: oldImageMediaId,
        },
      });
    } catch (error) {
      console.warn(
        'No se pudo eliminar la imagen anterior. Se desactivará en su lugar.',
        error,
      );

      await this.prisma.mediaAsset.updateMany({
        where: {
          id: oldImageMediaId,
        },
        data: {
          isActive: false,
        },
      });
    }
  }

  private async validateRelations(dto: {
    packageId?: string | null;
    campaignId?: string | null;
    imageMediaId?: string | null;
  }) {
    if (dto.packageId) {
      const packageExists = await this.prisma.package.findUnique({
        where: { id: dto.packageId },
        select: { id: true },
      });

      if (!packageExists) {
        throw new NotFoundException('El paquete seleccionado no existe.');
      }
    }

    if (dto.campaignId) {
      const campaignExists = await this.prisma.campaign.findUnique({
        where: { id: dto.campaignId },
        select: { id: true },
      });

      if (!campaignExists) {
        throw new NotFoundException('La campaña seleccionada no existe.');
      }
    }

    if (dto.imageMediaId) {
      const imageExists = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.imageMediaId },
        select: {
          id: true,
          kind: true,
          isActive: true,
        },
      });

      if (!imageExists) {
        throw new NotFoundException('La imagen seleccionada no existe.');
      }

      if (imageExists.kind !== MediaKind.IMAGE) {
        throw new BadRequestException(
          'El archivo seleccionado no es una imagen.',
        );
      }

      if (!imageExists.isActive) {
        throw new BadRequestException(
          'La imagen seleccionada no está activa.',
        );
      }
    }
  }

  private hasAnyTranslationValue(input: Partial<PromotionTranslationInput>) {
    return (
      input.title !== undefined ||
      input.subtitle !== undefined ||
      input.description !== undefined ||
      input.buttonText !== undefined
    );
  }

  private normalizeTranslations(
    translations?: PromotionTranslationInput[],
  ): PromotionTranslationInput[] {
    const clean = (translations ?? [])
      .map((item) => ({
        lang: this.normalizeLang(item.lang),
        title: item.title,
        subtitle: item.subtitle,
        description: item.description,
        buttonText: item.buttonText,
      }))
      .filter((item) => this.hasAnyTranslationValue(item));

    const langs = clean.map((item) => item.lang);

    if (new Set(langs).size !== langs.length) {
      throw new BadRequestException(
        'No puedes repetir el mismo idioma en translations.',
      );
    }

    return clean;
  }

  private buildLegacyTranslation(dto: CreatePromotionDto) {
    return {
      lang: 'es',
      title: dto.title,
      subtitle: dto.subtitle,
      description: dto.description,
      buttonText: dto.buttonText ?? 'Reservar',
    };
  }

  private buildTranslationCreateData(item: PromotionTranslationInput) {
    return {
      lang: this.normalizeLang(item.lang),
      title: item.title ?? null,
      subtitle: item.subtitle ?? null,
      description: item.description ?? null,
      buttonText: item.buttonText ?? null,
    };
  }

  private buildLanguageUpdateData(dto: UpsertPromotionLanguageDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.buttonText !== undefined ? { buttonText: dto.buttonText } : {}),
    };
  }

  async create(dto: CreatePromotionDto) {
    this.validateDateRange(dto.startAt, dto.endAt);
    await this.validateRelations(dto);

    const translations = this.normalizeTranslations(dto.translations);
    const finalTranslations =
      translations.length > 0
        ? translations
        : [this.buildLegacyTranslation(dto)];

    const created = await this.prisma.promotion.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        isActive: dto.isActive ?? true,
        sectionType: dto.sectionType ?? PromotionSectionType.STANDARD,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        description: dto.description ?? null,
        buttonText: dto.buttonText ?? 'Reservar',
        buttonUrl: dto.buttonUrl ?? null,
        order: dto.order ?? 0,
        priority: dto.priority ?? 0,
        startAt: this.normalizeDate(dto.startAt),
        endAt: this.normalizeDate(dto.endAt),
        packageId: dto.packageId ?? null,
        campaignId: dto.campaignId ?? null,
        imageMediaId: dto.imageMediaId ?? null,
        translations: {
          create: finalTranslations.map((item) =>
            this.buildTranslationCreateData(item),
          ),
        },
      },
      include: this.getPromotionInclude('es'),
    });

    return this.mapPromotion(created);
  }

  async findAll(lang = 'es') {
    const normalizedLang = this.normalizeLang(lang);

    const promotions = await this.prisma.promotion.findMany({
      orderBy: [
        { sectionType: 'asc' },
        { priority: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
      include: this.getPromotionInclude(normalizedLang),
    });

    return promotions.map((promotion) => this.mapPromotion(promotion));
  }

  async findOne(id: string, lang = 'es') {
    const normalizedLang = this.normalizeLang(lang);

    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: this.getPromotionInclude(normalizedLang),
    });

    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    return this.mapPromotion(promotion);
  }

  async update(id: string, dto: UpdatePromotionDto) {
    await this.findOne(id, 'es');

    this.validateDateRange(dto.startAt, dto.endAt);
    await this.validateRelations(dto);

    const translations = this.normalizeTranslations(dto.translations);

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        code: dto.code === undefined ? undefined : dto.code.trim().toUpperCase(),
        isActive: dto.isActive,
        sectionType: dto.sectionType,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        buttonText: dto.buttonText,
        buttonUrl: dto.buttonUrl,
        order: dto.order,
        priority: dto.priority,
        startAt:
          dto.startAt === undefined ? undefined : this.normalizeDate(dto.startAt),
        endAt:
          dto.endAt === undefined ? undefined : this.normalizeDate(dto.endAt),
        packageId:
          dto.packageId === undefined ? undefined : dto.packageId || null,
        campaignId:
          dto.campaignId === undefined ? undefined : dto.campaignId || null,
        imageMediaId:
          dto.imageMediaId === undefined ? undefined : dto.imageMediaId || null,

        ...(translations.length > 0
          ? {
              translations: {
                upsert: translations.map((item) => ({
                  where: {
                    promotionId_lang: {
                      promotionId: id,
                      lang: item.lang,
                    },
                  },
                  update: {
                    ...(item.title !== undefined ? { title: item.title } : {}),
                    ...(item.subtitle !== undefined
                      ? { subtitle: item.subtitle }
                      : {}),
                    ...(item.description !== undefined
                      ? { description: item.description }
                      : {}),
                    ...(item.buttonText !== undefined
                      ? { buttonText: item.buttonText }
                      : {}),
                  },
                  create: this.buildTranslationCreateData(item),
                })),
              },
            }
          : {}),
      },
      include: this.getPromotionInclude('es'),
    });

    return this.mapPromotion(updated);
  }

  async upsertPromotionLanguage(
    id: string,
    lang: string,
    dto: UpsertPromotionLanguageDto,
  ) {
    const normalizedLang = this.normalizeLang(lang);

    if (!this.hasAnyTranslationValue(dto)) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar el idioma.',
      );
    }

    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    await this.prisma.promotionTranslation.upsert({
      where: {
        promotionId_lang: {
          promotionId: id,
          lang: normalizedLang,
        },
      },
      update: this.buildLanguageUpdateData(dto),
      create: {
        promotionId: id,
        lang: normalizedLang,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        description: dto.description ?? null,
        buttonText: dto.buttonText ?? null,
      },
    });

    if (normalizedLang === 'es') {
      await this.prisma.promotion.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && dto.title !== null
            ? { title: dto.title }
            : {}),
          ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.buttonText !== undefined
            ? { buttonText: dto.buttonText }
            : {}),
        },
      });
    }

    const updated = await this.prisma.promotion.findUnique({
      where: { id },
      include: this.getPromotionInclude(normalizedLang),
    });

    return {
      success: true,
      message: `Traducción ${normalizedLang} actualizada correctamente.`,
      data: this.mapPromotion(updated),
    };
  }

  async replaceImage(id: string, file: PromotionImageUploadFile) {
    this.validateUploadedImage(file);

    const promotion = await this.prisma.promotion.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        imageMediaId: true,
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    const filename = file.filename as string;
    const buffer = file.buffer as Buffer;

    const oldImageMediaId = promotion.imageMediaId;

    const updatedPromotion = await this.prisma.$transaction(async (tx) => {
      const newImage = await tx.mediaAsset.create({
        data: {
          kind: MediaKind.IMAGE,
          mimeType: file.mimetype,
          ext: this.getExtFromFilename(filename),
          size: file.size,
          originalName: file.originalname,
          filename,
          path: `media/file/${filename}`,
          url: `/media/file/${filename}`,
          isActive: true,
          data: new Uint8Array(buffer),
        },
      });

      return tx.promotion.update({
        where: {
          id,
        },
        data: {
          imageMediaId: newImage.id,
        },
        include: this.getPromotionInclude('es'),
      });
    });

    await this.deleteOldImageIfPossible(oldImageMediaId);

    return this.mapPromotion(updatedPromotion);
  }

  async remove(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    return this.prisma.promotion.delete({
      where: { id },
    });
  }

  async reorder(dto: ReorderPromotionsDto) {
    const transaction = dto.items.map((item) =>
      this.prisma.promotion.update({
        where: { id: item.id },
        data: {
          order: item.order,
        },
        include: this.getPromotionInclude('es'),
      }),
    );

    const updated = await this.prisma.$transaction(transaction);

    return updated.map((promotion) => this.mapPromotion(promotion));
  }

  async findPublicPromotions(lang = 'es') {
    const normalizedLang = this.normalizeLang(lang);
    const dateFilter = this.buildDateFilter();

    const monthlyPromotion = await this.prisma.promotion.findFirst({
      where: {
        isActive: true,
        sectionType: PromotionSectionType.MONTHLY,
        ...dateFilter,
      },
      orderBy: [
        { priority: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
      include: this.getPromotionInclude(normalizedLang),
    });

    const standardPromotions = await this.prisma.promotion.findMany({
      where: {
        isActive: true,
        sectionType: PromotionSectionType.STANDARD,
        ...dateFilter,
      },
      orderBy: [
        { priority: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
      include: this.getPromotionInclude(normalizedLang),
    });

    if (monthlyPromotion) {
      return this.mapPublicResponse({
        featuredPromotion: monthlyPromotion,
        promotions: standardPromotions,
      });
    }

    const [fallbackPromotion, ...restPromotions] = standardPromotions;

    return this.mapPublicResponse({
      featuredPromotion: fallbackPromotion ?? null,
      promotions: restPromotions,
    });
  }
}