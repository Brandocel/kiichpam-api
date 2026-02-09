import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { PackagesModule } from './modules/packages/packages.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { MediaModule } from './modules/media/media.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HeroModule } from './modules/hero/hero.module';


@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'), // carpeta física
      serveRoot: '/uploads',                    // ruta pública
    }),
    PrismaModule,
    HealthModule,
    PackagesModule,
    ReservationsModule,
    CouponsModule,
    MediaModule,
    HeroModule,

  ],
})
export class AppModule {}
