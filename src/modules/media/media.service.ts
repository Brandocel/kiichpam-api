import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { join } from 'path';
import { promises as fs } from 'fs';
import { MediaKind } from '@prisma/client';
import { Express } from 'express';   // ← Agregado

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private kindFromMime(mime: string): MediaKind {
    return mime.startsWith('video/') ? MediaKind.VIDEO : MediaKind.IMAGE;
  }

  private mapAsset(asset: any) {
    return {
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      ext: asset.ext,
      size: asset.size,
      originalName: asset.originalName,
      filename: asset.filename,
      path: asset.path,
      url: asset.url,
      isActive: asset.isActive,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  async registerUploadedFiles(files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      return {
        success: true,
        message: 'No se recibieron archivos',
        uploaded: 0,
        data: [],
      };
    }

    await this.prisma.mediaAsset.createMany({
      data: files.map((f) => ({
        kind: this.kindFromMime(f.mimetype),
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
      where: {
        OR: filenames.map((filename) => ({ filename })),
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Archivos registrados correctamente',
      uploaded: assets.length,
      data: assets.map((asset) => this.mapAsset(asset)),
    };
  }

  async list(filters: { kind?: 'IMAGE' | 'VIDEO'; isActive?: boolean }) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        ...(filters.kind ? { kind: filters.kind as MediaKind } : {}),
        ...(filters.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Media listada correctamente',
      data: assets.map((asset) => this.mapAsset(asset)),
    };
  }

  async getById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException('Media no encontrada');
    }

    return {
      success: true,
      message: 'Media obtenida correctamente',
      data: this.mapAsset(asset),
    };
  }

  async toggleActive(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException('Media no encontrada');
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { isActive: !asset.isActive },
    });

    return {
      success: true,
      message: `Media ${updated.isActive ? 'activada' : 'desactivada'} correctamente`,
      data: this.mapAsset(updated),
    };
  }

  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        ext: true,
        size: true,
        originalName: true,
        path: true,
        url: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!asset) {
      throw new NotFoundException('Media no encontrada');
    }

    if (!asset.path) {
      throw new NotFoundException('El archivo no tiene una ruta válida');
    }

    const absFilePath = join(process.cwd(), asset.path);

    try {
      await fs.unlink(absFilePath);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        throw e;
      }
    }

    await this.prisma.mediaAsset.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Media eliminada correctamente',
      data: { id, deleted: true },
    };
  }
}