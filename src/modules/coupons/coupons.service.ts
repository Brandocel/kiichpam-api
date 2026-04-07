import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateCouponDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    const existingCoupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (existingCoupon) {
      throw new BadRequestException('Coupon code already exists');
    }

    let packageId: string | null = null;
    let campaignId: string | null = null;

    if (dto.packageCode) {
      const normalizedPackageCode = dto.packageCode.trim().toUpperCase();

      const pkg = await this.prisma.package.findUnique({
        where: { code: normalizedPackageCode },
      });

      if (!pkg) {
        throw new BadRequestException('Package not found');
      }

      packageId = pkg.id;
    }

    if (dto.campaignCode) {
      const normalizedCampaignCode = dto.campaignCode.trim().toUpperCase();

      const campaign = await this.prisma.campaign.findUnique({
        where: { code: normalizedCampaignCode },
      });

      if (campaign) {
        campaignId = campaign.id;
      }
    }

    if (dto.type === 'PERCENT' && (dto.value < 0 || dto.value > 100)) {
      throw new BadRequestException('Coupon percent value invalid');
    }

    if (dto.type === 'FIXED' && dto.value < 0) {
      throw new BadRequestException('Coupon fixed value invalid');
    }

    if (dto.startsAt && dto.endsAt) {
      const startsAt = new Date(dto.startsAt);
      const endsAt = new Date(dto.endsAt);

      if (startsAt > endsAt) {
        throw new BadRequestException('Coupon date range invalid');
      }
    }

    if (dto.scope === 'PACKAGE_ONLY' && !packageId) {
      throw new BadRequestException(
        'PACKAGE_ONLY coupon requires a valid packageCode',
      );
    }

    if (dto.scope === 'CAMPAIGN_ONLY' && !campaignId) {
      throw new BadRequestException(
        'CAMPAIGN_ONLY coupon requires a valid campaignCode in database',
      );
    }

    return this.prisma.coupon.create({
      data: {
        code: normalizedCode,
        type: dto.type,
        value: dto.value,
        scope: dto.scope,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        maxUses: dto.maxUses ?? null,
        packageId,
        campaignId,
      },
    });
  }

  async validate(dto: ValidateCouponDto) {
    const result = await this.calculateDiscount({
      couponCode: dto.couponCode,
      subtotalMXN: dto.subtotalMXN,
      packageCode: dto.packageCode,
      campaignCode: dto.campaignCode,
    });

    return {
      coupon: {
        code: result.coupon.code,
        type: result.coupon.type,
        value: result.coupon.value,
        scope: result.coupon.scope,
        startsAt: result.coupon.startsAt,
        endsAt: result.coupon.endsAt,
        maxUses: result.coupon.maxUses,
        uses: result.coupon.uses,
        isActive: result.coupon.isActive,
      },
      pricing: {
        subtotalMXN: result.subtotalMXN,
        discountMXN: result.discountMXN,
        totalMXN: result.totalMXN,
      },
    };
  }

  async calculateDiscount(params: {
    couponCode: string;
    subtotalMXN: number;
    packageCode?: string;
    campaignCode?: string;
  }) {
    const normalizedCode = params.couponCode.trim().toUpperCase();

    if (params.subtotalMXN <= 0) {
      throw new BadRequestException('Subtotal invalid');
    }

    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Coupon inactive');
    }

    const now = new Date();

    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException('Coupon not started');
    }

    if (coupon.endsAt && now > coupon.endsAt) {
      throw new BadRequestException('Coupon expired');
    }

    if (coupon.maxUses && coupon.uses >= coupon.maxUses) {
      throw new BadRequestException('Coupon max uses reached');
    }

    let packageId: string | null = null;
    let campaignId: string | null = null;

    if (params.packageCode) {
      const normalizedPackageCode = params.packageCode.trim().toUpperCase();

      const pkg = await this.prisma.package.findUnique({
        where: { code: normalizedPackageCode },
      });

      if (!pkg) {
        throw new BadRequestException('Package not found');
      }

      packageId = pkg.id;
    }

    if (params.campaignCode) {
      const normalizedCampaignCode = params.campaignCode.trim().toUpperCase();

      const campaign = await this.prisma.campaign.findUnique({
        where: { code: normalizedCampaignCode },
      });

      if (campaign) {
        campaignId = campaign.id;
      }
    }

    if (coupon.scope === 'PACKAGE_ONLY') {
      if (!coupon.packageId) {
        throw new BadRequestException('Coupon package configuration invalid');
      }

      if (!packageId || coupon.packageId !== packageId) {
        throw new BadRequestException('Coupon not valid for this package');
      }
    }

    if (coupon.scope === 'CAMPAIGN_ONLY') {
      if (!coupon.campaignId) {
        throw new BadRequestException('Coupon campaign configuration invalid');
      }

      if (!campaignId || coupon.campaignId !== campaignId) {
        throw new BadRequestException('Coupon not valid for this campaign');
      }
    }

    let discountMXN = 0;

    if (coupon.type === 'PERCENT') {
      if (coupon.value < 0 || coupon.value > 100) {
        throw new BadRequestException('Coupon percent value invalid');
      }

      discountMXN = Math.floor(params.subtotalMXN * (coupon.value / 100));
    }

    if (coupon.type === 'FIXED') {
      if (coupon.value < 0) {
        throw new BadRequestException('Coupon fixed value invalid');
      }

      discountMXN = coupon.value;
    }

    if (discountMXN > params.subtotalMXN) {
      discountMXN = params.subtotalMXN;
    }

    return {
      coupon,
      subtotalMXN: params.subtotalMXN,
      discountMXN,
      totalMXN: params.subtotalMXN - discountMXN,
    };
  }

  async incrementUse(code: string) {
    return this.prisma.coupon.update({
      where: { code: code.trim().toUpperCase() },
      data: {
        uses: {
          increment: 1,
        },
      },
    });
  }
}