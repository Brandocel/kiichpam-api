import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly maxFileSize = 5 * 1024 * 1024;

  private kindFromMime(mime: string): MediaKind {
    return mime.startsWith('video/') ? MediaKind.VIDEO : MediaKind.IMAGE;
  }

  getExtensionFromMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
    };

    return extensions[mimeType] || '.bin';
  }

  private getExtFromFilename(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
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

    for (const file of files) {
      if (!file.buffer) {
        throw new BadRequestException(
          `El archivo ${file.originalname} no contiene datos en memoria`,
        );
      }

      if (file.size > this.maxFileSize) {
        throw new BadRequestException(
          `El archivo ${file.originalname} supera el límite de 5 MB`,
        );
      }
    }

    const createdAssets = await this.prisma.$transaction(
      files.map((file) =>
        this.prisma.mediaAsset.create({
          data: {
            kind: this.kindFromMime(file.mimetype),
            mimeType: file.mimetype,
            ext: this.getExtFromFilename(file.filename),
            size: file.size,
            originalName: file.originalname,
            filename: file.filename,
            path: `media/file/${file.filename}`,
            url: `/media/file/${file.filename}`,
            data: file.buffer,
          },
        }),
      ),
    );

    return {
      success: true,
      message: 'Archivos registrados correctamente',
      uploaded: createdAssets.length,
      data: createdAssets.map((asset) => this.mapAsset(asset)),
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
      select: {
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      message: 'Media listada correctamente',
      data: assets.map((asset) => this.mapAsset(asset)),
    };
  }

  async getById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: {
        id,
      },
      select: {
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
      },
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

  async getFileByFilename(filename: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: {
        filename,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        data: true,
        isActive: true,
      },
    });

    if (!asset) {
      throw new NotFoundException('Archivo no encontrado');
    }

    if (!asset.isActive) {
      throw new NotFoundException('Archivo no disponible');
    }

    if (!asset.data) {
      throw new NotFoundException('El archivo no contiene datos');
    }

    return {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      data: Buffer.from(asset.data),
    };
  }

  async toggleActive(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: {
        id,
      },
    });

    if (!asset) {
      throw new NotFoundException('Media no encontrada');
    }

    const updated = await this.prisma.mediaAsset.update({
      where: {
        id,
      },
      data: {
        isActive: !asset.isActive,
      },
    });

    return {
      success: true,
      message: `Media ${
        updated.isActive ? 'activada' : 'desactivada'
      } correctamente`,
      data: this.mapAsset(updated),
    };
  }

  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!asset) {
      throw new NotFoundException('Media no encontrada');
    }

    await this.prisma.mediaAsset.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
      message: 'Media eliminada correctamente',
      data: {
        id,
        deleted: true,
      },
    };
  }
}