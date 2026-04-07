import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@Injectable()
export class HeroService {
  constructor(private readonly prisma: PrismaService) {}

  private mapSlide(slide: any) {
    return {
      id: slide.id,
      order: slide.order,
      isActive: slide.isActive,
      title: slide.title,
      subtitle: slide.subtitle,
      linkUrl: slide.linkUrl,
      linkText: slide.linkText,
      altText: slide.altText,
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

  async getSlides(filters?: { isActive?: boolean }) {
    const slides = await this.prisma.heroCarouselSlide.findMany({
      where: {
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      include: {
        media: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    const clean = slides.filter((s) => s.media?.isActive);

    return {
      success: true,
      message: 'Hero slides obtenidos correctamente',
      data: clean.map((s) => this.mapSlide(s)),
    };
  }

  async getSlideById(id: string) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
      include: {
        media: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            isActive: true,
          },
        },
      },
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    return {
      success: true,
      message: 'Slide obtenido correctamente',
      data: this.mapSlide(slide),
    };
  }

  async createSlide(dto: CreateHeroSlideDto) {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id: dto.mediaId },
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

    const created = await this.prisma.heroCarouselSlide.create({
      data: {
        mediaId: dto.mediaId,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        linkUrl: dto.linkUrl ?? null,
        linkText: dto.linkText ?? null,
        altText: dto.altText ?? null,
      },
      include: {
        media: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            isActive: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Slide creado correctamente',
      data: this.mapSlide(created),
    };
  }

  async updateSlide(id: string, dto: UpdateHeroSlideDto) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({
      where: { id },
    });

    if (!slide) {
      throw new NotFoundException('Slide no encontrado');
    }

    if (dto.mediaId !== undefined) {
      const media = await this.prisma.mediaAsset.findUnique({
        where: { id: dto.mediaId },
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
    }

    const updated = await this.prisma.heroCarouselSlide.update({
      where: { id },
      data: {
        ...(dto.mediaId !== undefined ? { mediaId: dto.mediaId } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.linkText !== undefined ? { linkText: dto.linkText } : {}),
        ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
      },
      include: {
        media: {
          select: {
            id: true,
            url: true,
            mimeType: true,
            isActive: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Slide actualizado correctamente',
      data: this.mapSlide(updated),
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