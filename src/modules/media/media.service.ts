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
        path: `uploads/${f.filename}`,
        url: `/uploads/${f.filename}`,
      })),
    });

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

  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Media no encontrada');

    const absFilePath = join(process.cwd(), asset.path);

    try {
      await fs.unlink(absFilePath);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }

    await this.prisma.mediaAsset.delete({ where: { id } });

    return { deleted: true, id };
  }
}