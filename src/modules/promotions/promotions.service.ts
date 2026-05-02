import {
    BadRequestException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { PromotionSectionType } from '@prisma/client';
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
  
    private getPromotionInclude() {
      return {
        package: {
          include: {
            translations: true,
            coverMedia: true,
          },
        },
        campaign: {
          include: {
            translations: {
              include: {
                imageMedia: true,
              },
            },
          },
        },
        imageMedia: true,
      };
    }
  
    private normalizeDate(value?: string | null) {
      if (!value) return null;
      return new Date(value);
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
  
    async create(dto: CreatePromotionDto) {
      if (dto.startAt && dto.endAt) {
        const start = new Date(dto.startAt);
        const end = new Date(dto.endAt);
  
        if (start > end) {
          throw new BadRequestException(
            'La fecha de inicio no puede ser mayor a la fecha de finalización.',
          );
        }
      }
  
      if (dto.packageId) {
        const packageExists = await this.prisma.package.findUnique({
          where: { id: dto.packageId },
        });
  
        if (!packageExists) {
          throw new NotFoundException('El paquete seleccionado no existe.');
        }
      }
  
      if (dto.campaignId) {
        const campaignExists = await this.prisma.campaign.findUnique({
          where: { id: dto.campaignId },
        });
  
        if (!campaignExists) {
          throw new NotFoundException('La campaña seleccionada no existe.');
        }
      }
  
      if (dto.imageMediaId) {
        const imageExists = await this.prisma.mediaAsset.findUnique({
          where: { id: dto.imageMediaId },
        });
  
        if (!imageExists) {
          throw new NotFoundException('La imagen seleccionada no existe.');
        }
      }
  
      return this.prisma.promotion.create({
        data: {
          code: dto.code,
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
  
      if (dto.startAt && dto.endAt) {
        const start = new Date(dto.startAt);
        const end = new Date(dto.endAt);
  
        if (start > end) {
          throw new BadRequestException(
            'La fecha de inicio no puede ser mayor a la fecha de finalización.',
          );
        }
      }
  
      if (dto.packageId) {
        const packageExists = await this.prisma.package.findUnique({
          where: { id: dto.packageId },
        });
  
        if (!packageExists) {
          throw new NotFoundException('El paquete seleccionado no existe.');
        }
      }
  
      if (dto.campaignId) {
        const campaignExists = await this.prisma.campaign.findUnique({
          where: { id: dto.campaignId },
        });
  
        if (!campaignExists) {
          throw new NotFoundException('La campaña seleccionada no existe.');
        }
      }
  
      if (dto.imageMediaId) {
        const imageExists = await this.prisma.mediaAsset.findUnique({
          where: { id: dto.imageMediaId },
        });
  
        if (!imageExists) {
          throw new NotFoundException('La imagen seleccionada no existe.');
        }
      }
  
      return this.prisma.promotion.update({
        where: { id },
        data: {
          code: dto.code,
          isActive: dto.isActive,
          sectionType: dto.sectionType,
          title: dto.title,
          subtitle: dto.subtitle,
          description: dto.description,
          buttonText: dto.buttonText,
          buttonUrl: dto.buttonUrl,
          order: dto.order,
          priority: dto.priority,
          startAt: dto.startAt === undefined ? undefined : this.normalizeDate(dto.startAt),
          endAt: dto.endAt === undefined ? undefined : this.normalizeDate(dto.endAt),
          packageId: dto.packageId === undefined ? undefined : dto.packageId || null,
          campaignId: dto.campaignId === undefined ? undefined : dto.campaignId || null,
          imageMediaId:
            dto.imageMediaId === undefined ? undefined : dto.imageMediaId || null,
        },
        include: this.getPromotionInclude(),
      });
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