import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@Injectable()
export class HeroService {
  constructor(private prisma: PrismaService) {}

  async getSlides(filters: { isActive: boolean }) {
    const slides = await this.prisma.heroCarouselSlide.findMany({
      where: { isActive: filters.isActive },
      include: {
        media: { select: { id: true, url: true, mimeType: true, isActive: true } },
      },
      orderBy: { order: 'asc' },
    });

    const clean = slides.filter((s) => s.media?.isActive);

    return {
      success: true,
      message: 'OK',
      data: clean.map((s) => ({
        id: s.id,
        order: s.order,
        isActive: s.isActive,
        title: s.title,
        subtitle: s.subtitle,
        linkUrl: s.linkUrl,
        linkText: s.linkText,
        altText: s.altText,
        media: s.media,
      })),
    };
  }

  async createSlide(dto: CreateHeroSlideDto) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: dto.mediaId } });
    if (!media) throw new NotFoundException('Media no encontrada');
    if (media.kind !== 'IMAGE') throw new BadRequestException('El Hero solo acepta IMAGE');
    if (!media.isActive) throw new BadRequestException('La media está inactiva');

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
        media: { select: { id: true, url: true, mimeType: true } },
      },
    });

    return { success: true, message: 'Created', data: created };
  }

  async updateSlide(id: string, dto: UpdateHeroSlideDto) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({ where: { id } });
    if (!slide) throw new NotFoundException('Slide no encontrado');

    // Si cambian mediaId, valida que sea IMAGE y exista
    if (dto.mediaId) {
      const media = await this.prisma.mediaAsset.findUnique({ where: { id: dto.mediaId } });
      if (!media) throw new NotFoundException('Media no encontrada');
      if (media.kind !== 'IMAGE') throw new BadRequestException('El Hero solo acepta IMAGE');
    }

    const updated = await this.prisma.heroCarouselSlide.update({
      where: { id },
      data: {
        mediaId: dto.mediaId ?? undefined,
        order: dto.order ?? undefined,
        isActive: dto.isActive ?? undefined,
        title: dto.title ?? undefined,
        subtitle: dto.subtitle ?? undefined,
        linkUrl: dto.linkUrl ?? undefined,
        linkText: dto.linkText ?? undefined,
        altText: dto.altText ?? undefined,
      },
      include: {
        media: { select: { id: true, url: true, mimeType: true } },
      },
    });

    return { success: true, message: 'Updated', data: updated };
  }

  async deleteSlide(id: string) {
    const slide = await this.prisma.heroCarouselSlide.findUnique({ where: { id } });
    if (!slide) throw new NotFoundException('Slide no encontrado');

    await this.prisma.heroCarouselSlide.delete({ where: { id } });
    return { success: true, message: 'Deleted' };
  }
}
