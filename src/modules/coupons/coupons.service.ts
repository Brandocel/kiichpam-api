import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateCouponDto) {
    // Si mandan packageCode, lo convertimos a packageId
    let packageId: string | undefined = undefined;
    if (dto.packageCode) {
      const pkg = await this.prisma.package.findUnique({ where: { code: dto.packageCode } });
      if (!pkg) throw new BadRequestException('Package not found for packageCode');
      packageId = pkg.id;
    }

    // CampaignCode -> por ahora SOLO lo guardamos como campaignId más adelante,
    // porque tu Campaign tiene relación opcional. (Si ya tienes Campaign table con code, lo conectamos)
    // Por ahora lo dejamos sin campaignId para no bloquearte.
    const data = {
      code: dto.code,
      type: dto.type as any,
      value: dto.value,
      scope: dto.scope as any,
      isActive: dto.isActive ?? true,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      maxUses: dto.maxUses ?? null,
      packageId: packageId ?? null,
      // campaignId: null (luego lo conectamos)
    };

    return this.prisma.coupon.create({ data });
  }

  async validate(dto: ValidateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: dto.couponCode },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid coupon');
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) throw new BadRequestException('Coupon not started');
    if (coupon.endsAt && now > coupon.endsAt) throw new BadRequestException('Coupon expired');

    if (coupon.maxUses && coupon.uses >= coupon.maxUses) throw new BadRequestException('Coupon max uses reached');

    // Si viene packageCode, validamos contra la restricción packageId del cupón
    if (dto.packageCode) {
      const pkg = await this.prisma.package.findUnique({ where: { code: dto.packageCode } });
      if (!pkg) throw new BadRequestException('Package not found');

      if (coupon.packageId && coupon.packageId !== pkg.id) {
        throw new BadRequestException('Coupon not valid for this package');
      }
    }

    // Campaign: lo conectamos después si quieres con tabla Campaign
    // if (coupon.campaignId && !dto.campaignCode) throw new BadRequestException('Coupon requires campaign');

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      scope: coupon.scope,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      maxUses: coupon.maxUses,
      uses: coupon.uses,
      isActive: coupon.isActive,
    };
  }
}
