// src/modules/media/media.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { join } from 'path';
import { promises as fs } from 'fs';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private kindFromMime(mime: string) {
    return mime.startsWith('video/') ? 'VIDEO' : 'IMAGE';
  }

  async registerUploadedFiles(files: Express.Multer.File[]) {
    const created = await this.prisma.mediaAsset.createMany({
      data: files.map((f) => ({
        kind: this.kindFromMime(f.mimetype) as any,
        mimeType: f.mimetype,
        ext: (f.originalname.split('.').pop() || '').toLowerCase(),
        size: f.size,
        originalName: f.originalname,
        filename: f.filename,
        path: f.path.replace(/\\/g, '/'),
        url: `/uploads/${f.filename}`,
      })),
    });

    // createMany no regresa registros, así que listamos por filename:
    const filenames = files.map((f) => f.filename);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { filename: { in: filenames } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      uploaded: created.count,
      assets,
    };
  }

  async list(filters: { kind?: 'IMAGE' | 'VIDEO'; isActive?: boolean }) {
    return this.prisma.mediaAsset.findMany({
      where: {
        ...(filters.kind ? { kind: filters.kind as any } : {}),
        ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media no encontrada');
    return asset;
  }

  async toggleActive(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media no encontrada');

    return this.prisma.mediaAsset.update({
      where: { id },
      data: { isActive: !asset.isActive },
    });
  }

  /**
   * ✅ Eliminar media:
   * - borra el archivo físico en /uploads (si existe)
   * - borra el registro en BD
   */
  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media no encontrada');

    // ⚠️ Si tienes tablas relacionadas (ej. HeroCarouselSlide) sin cascade,
    // descomenta esto (y ajusta el nombre del modelo si difiere):
    //
    // await this.prisma.heroCarouselSlide.deleteMany({
    //   where: { mediaId: id },
    // });

    // 1) Eliminar archivo físico
    // asset.path trae algo como: "uploads/....webp"
    const normalizedPath = asset.path.replace(/\\/g, '/');

    // Si ya viene con "uploads/...", esto lo convierte a ruta absoluta correcta:
    const absFilePath = join(process.cwd(), normalizedPath);

    try {
      await fs.unlink(absFilePath);
    } catch (e: any) {
      // Si no existe el archivo, no fallamos
      if (e?.code !== 'ENOENT') throw e;
    }

    // 2) Eliminar registro en BD
    await this.prisma.mediaAsset.delete({ where: { id } });

    return { deleted: true, id };
  }
}
