import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { UpsertHeroSlideLanguageDto } from './dto/upsert-hero-slide-language.dto';

type HeroLanguageInput = {
  lang: string;
  title?: string | null;
  subtitle?: string | null;
  linkText?: string | null;
  altText?: string | null;
};

@Injectable()
export class HeroService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeLang(lang?: string) {
    return (lang ?? 'es').trim().toLowerCase() || 'es';
  }

  private getSlideInclude(lang = 'es') {
    const normalizedLang = this.normalizeLang(lang);

    return {
      media: {
        select: {
          id: true,
          url: true,
          mimeType: true,
          isActive: true,
        },
      },
      translations: {
        where: {
          lang: normalizedLang,
        },
        select: {
          id: true,
          lang: true,
          title: true,
          subtitle: true,
          linkText: true,
          altText: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    };
  }

  private mapSlide(slide: any) {
    const translation = slide.translations?.[0] ?? null;

    return {
      id: slide.id,
      order: slide.order,
      isActive: slide.isActive,

      /**
       * Respuesta directa para que el frontend no se rompa.
       * Primero toma la traducción solicitada.
       * Si no existe, usa los campos legacy del slide.
       */
      title: translation?.title ?? slide.title ?? null,
      subtitle: translation?.subtitle ?? slide.subtitle ?? null,
      linkUrl: slide.linkUrl ?? null,
      linkText: translation?.linkText ?? slide.linkText ?? null,
      altText: translation?.altText ?? slide.altText ?? null,

      /**
       * Objeto de traducción, igual al estilo de Packages.
       */
      translation,

      media: slide.media
        ? {
            id: slide.media.id,
            url: slide.media.url,
            mimeType: slide.media.mimeType,
            isActive: slide.media.isActive,
          }
        : null,

      createdAt: slide.createdAt,
      updatedAt: slide.updatedAt,
    };
  }

  private hasAnyLanguageText(input: Partial<HeroLanguageInput>) {
    return (
      input.title !== undefined ||
      input.subtitle !== undefined ||
      input.linkText !== undefined ||
      input.altText !== undefined
    );
  }

  private normalizeLanguages(
    translations?: HeroLanguageInput[],
  ): HeroLanguageInput[] {
    const clean = (translations ?? [])
      .map((item) => ({
        lang: this.normalizeLang(item.lang),
        title: item.title,
        subtitle: item.subtitle,
        linkText: item.linkText,
        altText: item.altText,
      }))
      .filter((item) => this.hasAnyLanguageText(item));

    const langs = clean.map((item) => item.lang);

    if (new Set(langs).size !== langs.length) {
      throw new BadRequestException(
        'No puedes repetir el mismo idioma en translations',
      );
    }

    return clean;
  }

  private getCreateLanguages(dto: CreateHeroSlideDto): HeroLanguageInput[] {
    const translations = this.normalizeLanguages(dto.translations);

    if (translations.length > 0) {
      return translations;
    }

    /**
     * Compatibilidad:
     * Si mandas title, subtitle, linkText o altText directo,
     * se crea como traducción en español.
     */
    const legacyEs: HeroLanguageInput = {
      lang: 'es',
      title: dto.title,
      subtitle: dto.subtitle,
      linkText: dto.linkText,
      altText: dto.altText,
    };

    if (this.hasAnyLanguageText(legacyEs)) {
      return [legacyEs];
    }

    return [];
  }

  private getMainLanguage(languages: HeroLanguageInput[]) {
    return (
      languages.find((item) => item.lang === 'es') ??
      languages[0] ??
      null
    );
  }

  private buildLegacyDataFromCreateDto(
    dto: CreateHeroSlideDto,
    languages: HeroLanguageInput[],
  ) {
    const mainLanguage = this.getMainLanguage(languages);

    return {
      title: dto.title ?? mainLanguage?.title ?? null,
      subtitle: dto.subtitle ?? mainLanguage?.subtitle ?? null,
      linkText: dto.linkText ?? mainLanguage?.linkText ?? null,
      altText: dto.altText ?? mainLanguage?.altText ?? null,
    };
  }

  private buildLanguageCreateData(item: HeroLanguageInput) {
    return {
      lang: item.lang,
      title: item.title ?? null,
      subtitle: item.subtitle ?? null,
      linkText: item.linkText ?? null,
      altText: item.altText ?? null,
    };
  }

  private buildLanguageUpdateData(dto: UpsertHeroSlideLanguageDto) {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
      ...(dto.linkText !== undefined ? { linkText: dto.linkText } : {}),
      ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
    };
  }

  private async validateMediaImage(mediaId: string) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('Media no encontrada');
    }

    if (media.kind !== 'IMAGE') {
      throw new BadRequestException('El Hero solo acepta IMAGE');
    }

    if (!media.isActive) {
      throw new BadRequestException('La media está inactiva');
    }

    return media;
  }

  async getSlides(filters?: { isActive?: boolean; lang?: string }) {
    const lang = this.normalizeLang(filters?.lang);

    const slides = await this.prisma.heroCarouselSlide.findMany({
      where: {
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      include: this.getSlideInclude(lang),
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    const clean = slides.filter((slide) => slide.media?.isActive);

    return {
      success: true,
      message: 'Hero slides obtenidos correctamente',
      data: clean.map((slide) => this.mapSlide(slide)),
    };
  }

  async getSlideById(id: string, lang = 'es') {
    const normalizedLang = this.normalizeLang(lang);

    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
      include: this.getSlideInclude(normalizedLang),
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    if (!slide.media?.isActive) {
      throw new NotFoundException('La media del slide está inactiva');
    }

    return {
      success: true,
      message: 'Slide obtenido correctamente',
      data: this.mapSlide(slide),
    };
  }

  async createSlide(dto: CreateHeroSlideDto) {
    await this.validateMediaImage(dto.mediaId);

    const languages = this.getCreateLanguages(dto);
    const mainLanguage = this.getMainLanguage(languages);
    const responseLang = mainLanguage?.lang ?? 'es';
    const legacyData = this.buildLegacyDataFromCreateDto(dto, languages);

    const created = await this.prisma.heroCarouselSlide.create({
      data: {
        mediaId: dto.mediaId,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        linkUrl: dto.linkUrl ?? null,

        /**
         * Campos legacy.
         */
        title: legacyData.title,
        subtitle: legacyData.subtitle,
        linkText: legacyData.linkText,
        altText: legacyData.altText,

        /**
         * Traducciones nuevas.
         */
        ...(languages.length > 0
          ? {
              translations: {
                create: languages.map((item) =>
                  this.buildLanguageCreateData(item),
                ),
              },
            }
          : {}),
      },
      include: this.getSlideInclude(responseLang),
    });

    return {
      success: true,
      message: 'Slide creado correctamente',
      data: this.mapSlide(created),
    };
  }

  /**
   * PUT /hero/slides/:id
   * Actualiza datos generales del slide.
   * Para idiomas usar PATCH /hero/slides/:id/languages/:lang
   */
  async updateSlide(id: string, dto: UpdateHeroSlideDto) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    if (dto.mediaId !== undefined) {
      await this.validateMediaImage(dto.mediaId);
    }

    const updated = await this.prisma.heroCarouselSlide.update({
      where: { id },
      data: {
        ...(dto.mediaId !== undefined ? { mediaId: dto.mediaId } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),

        /**
         * Campos legacy.
         * Si quieres cambiar el idioma en específico, usa el PATCH de languages.
         */
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.linkText !== undefined ? { linkText: dto.linkText } : {}),
        ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
      },
      include: this.getSlideInclude('es'),
    });

    return {
      success: true,
      message: 'Slide actualizado correctamente',
      data: this.mapSlide(updated),
    };
  }

  /**
   * PATCH /hero/slides/:id/languages/:lang
   * Crea o actualiza la traducción de un idioma.
   */
  async upsertSlideLanguage(
    id: string,
    lang: string,
    dto: UpsertHeroSlideLanguageDto,
  ) {
    const normalizedLang = this.normalizeLang(lang);

    if (!this.hasAnyLanguageText(dto)) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar el idioma',
      );
    }

    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    await this.prisma.heroCarouselSlideTranslation.upsert({
      where: {
        slideId_lang: {
          slideId: id,
          lang: normalizedLang,
        },
      },
      update: this.buildLanguageUpdateData(dto),
      create: {
        slideId: id,
        lang: normalizedLang,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        linkText: dto.linkText ?? null,
        altText: dto.altText ?? null,
      },
    });

    /**
     * Compatibilidad:
     * Si actualizas español, también actualizamos los campos legacy.
     */
    if (normalizedLang === 'es') {
      await this.prisma.heroCarouselSlide.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
          ...(dto.linkText !== undefined ? { linkText: dto.linkText } : {}),
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
        },
      });
    }

    const updatedSlide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
      include: this.getSlideInclude(normalizedLang),
    });

    return {
      success: true,
      message: `Traducción ${normalizedLang} actualizada correctamente`,
      data: this.mapSlide(updatedSlide),
    };
  }

  async deleteSlide(id: string) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    await this.prisma.heroCarouselSlide.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Slide eliminado correctamente',
      data: { id },
    };
  }
}