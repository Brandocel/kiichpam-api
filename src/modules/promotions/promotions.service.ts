import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromotionSectionType } from '@prisma/client';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { extname, join } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ReorderPromotionsDto } from './dto/reorder-promotions.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private getNow() {
    return new Date();
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

  private getPromotionInclude() {
    const mediaSelect = this.getMediaSelect();

    return {
      package: {
        include: {
          translations: true,
          coverMedia: {
            select: mediaSelect,
          },
        },
      },
      campaign: {
        include: {
          translations: {
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

  private normalizeFilePath(filePath: string) {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  private buildFileUrl(filePath: string) {
    const cleanPath = this.normalizeFilePath(filePath);
    return `/${cleanPath}`;
  }

  private async safeDeleteLocalFile(filePath?: string | null) {
    if (!filePath) return;

    try {
      const cleanPath = this.normalizeFilePath(filePath);
      const absolutePath = join(process.cwd(), cleanPath);

      if (existsSync(absolutePath)) {
        await unlink(absolutePath);
      }
    } catch (error) {
      console.error('No se pudo eliminar la imagen anterior:', error);
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

      if (imageExists.kind !== 'IMAGE') {
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

  async create(dto: CreatePromotionDto) {
    this.validateDateRange(dto.startAt, dto.endAt);
    await this.validateRelations(dto);

    return this.prisma.promotion.create({
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
      },
      include: this.getPromotionInclude(),
    });
  }

  async findAll() {
    return this.prisma.promotion.findMany({
      orderBy: [
        { sectionType: 'asc' },
        { priority: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' },
      ],
      include: this.getPromotionInclude(),
    });
  }

  async findOne(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: this.getPromotionInclude(),
    });

    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada.');
    }

    return promotion;
  }

  async update(id: string, dto: UpdatePromotionDto) {
    await this.findOne(id);

    this.validateDateRange(dto.startAt, dto.endAt);
    await this.validateRelations(dto);

    return this.prisma.promotion.update({
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
      },
      include: this.getPromotionInclude(),
    });
  }

  /**
   * Reemplaza la imagen de una promoción.
   *
   * 1. Busca la promoción.
   * 2. Guarda la nueva imagen como mediaAsset.
   * 3. Actualiza imageMediaId en promotion.
   * 4. Desactiva el mediaAsset anterior.
   * 5. Elimina el archivo físico anterior del servidor.
   */
  async replaceImage(id: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('La imagen es obligatoria.');
    }

    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        imageMediaId: true,
        imageMedia: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });

    if (!promotion) {
      await this.safeDeleteLocalFile(file.path);
      throw new NotFoundException('Promoción no encontrada.');
    }

    const cleanPath = this.normalizeFilePath(file.path);
    const fileUrl = this.buildFileUrl(cleanPath);
    const fileExt = extname(file.originalname).replace('.', '').toLowerCase();

    try {
      const updatedPromotion = await this.prisma.$transaction(async (tx) => {
        const newImage = await tx.mediaAsset.create({
          data: {
            kind: 'IMAGE',
            mimeType: file.mimetype,
            ext: fileExt,
            size: file.size,
            originalName: file.originalname,
            filename: file.filename,
            path: cleanPath,
            url: fileUrl,
            isActive: true,
          },
        });

        const promotionUpdated = await tx.promotion.update({
          where: { id },
          data: {
            imageMediaId: newImage.id,
          },
          include: this.getPromotionInclude(),
        });

        if (promotion.imageMediaId) {
          await tx.mediaAsset.update({
            where: { id: promotion.imageMediaId },
            data: {
              isActive: false,
            },
          });
        }

        return promotionUpdated;
      });

      if (promotion.imageMedia?.path) {
        await this.safeDeleteLocalFile(promotion.imageMedia.path);
      }

      return updatedPromotion;
    } catch (error) {
      await this.safeDeleteLocalFile(file.path);
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);

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
        include: this.getPromotionInclude(),
      }),
    );

    return this.prisma.$transaction(transaction);
  }

  async findPublicPromotions() {
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
      include: this.getPromotionInclude(),
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
      include: this.getPromotionInclude(),
    });

    if (monthlyPromotion) {
      return {
        featuredPromotion: monthlyPromotion,
        promotions: standardPromotions,
      };
    }

    const [fallbackPromotion, ...restPromotions] = standardPromotions;

    return {
      featuredPromotion: fallbackPromotion ?? null,
      promotions: restPromotions,
    };
  }
}