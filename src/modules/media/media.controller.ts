import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { extname } from 'path';
import { MediaService } from './media.service';

function sanitizeBaseName(originalName: string) {
  const cleaned = (originalName || 'file')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_\.]/g, '')
    .toLowerCase();

  const ext = extname(cleaned);
  const base = cleaned.slice(0, -ext.length) || 'file';

  return {
    base: base.slice(-80),
    ext,
  };
}

function fileFilter(req: any, file: Express.Multer.File, cb: Function) {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];

  if (!allowed.includes(file.mimetype)) {
    return cb(
      new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype}`),
      false,
    );
  }

  cb(null, true);
}

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Subir imágenes o videos y guardarlos en PostgreSQL',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      fileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No se subieron archivos');
    }

    const preparedFiles = files.map((file) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const { base, ext } = sanitizeBaseName(file.originalname);

      const safeExt =
        ext ||
        this.mediaService.getExtensionFromMimeType(file.mimetype) ||
        '.bin';

      const filename = `${unique}-${base}${safeExt}`;

      return {
        ...file,
        filename,
      };
    });

    return this.mediaService.registerUploadedFiles(preparedFiles);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar archivos media registrados',
  })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: ['IMAGE', 'VIDEO'],
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: ['true', 'false'],
  })
  async list(
    @Query('kind') kind?: 'IMAGE' | 'VIDEO',
    @Query('isActive') isActive?: 'true' | 'false',
  ) {
    return this.mediaService.list({
      kind,
      isActive: isActive ? isActive === 'true' : undefined,
    });
  }

  @Get('file/:filename')
  @ApiOperation({
    summary: 'Servir archivo media desde PostgreSQL',
  })
  @ApiParam({
    name: 'filename',
    required: true,
  })
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async serveFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const file = await this.mediaService.getFileByFilename(filename);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return res.send(file.data);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener media por ID',
  })
  async getById(@Param('id') id: string) {
    return this.mediaService.getById(id);
  }

  @Patch(':id/toggle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activar o desactivar media',
  })
  async toggle(@Param('id') id: string) {
    return this.mediaService.toggleActive(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Eliminar media',
  })
  async remove(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }
}