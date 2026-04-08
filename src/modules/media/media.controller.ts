import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MediaService } from './media.service';
import { Express } from 'express';   // ← Importante agregar esto

function sanitizeBaseName(originalName: string) {
  const cleaned = (originalName || 'file')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_\.]/g, '')
    .toLowerCase();

  const ext = extname(cleaned);
  const base = cleaned.slice(0, -ext.length) || 'file';

  return { base: base.slice(-80), ext };
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads');

          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }

          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const { base, ext } = sanitizeBaseName(file.originalname);

          cb(null, `${unique}-${base}${ext}`);
        },
      }),
      fileFilter,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('No se subieron archivos');
    }
    return this.mediaService.registerUploadedFiles(files);
  }

  @Get()
  @ApiBearerAuth()
  @ApiQuery({ name: 'kind', required: false, enum: ['IMAGE', 'VIDEO'] })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false'] })
  async list(
    @Query('kind') kind?: 'IMAGE' | 'VIDEO',
    @Query('isActive') isActive?: 'true' | 'false',
  ) {
    return this.mediaService.list({
      kind,
      isActive: isActive ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @ApiBearerAuth()
  async getById(@Param('id') id: string) {
    return this.mediaService.getById(id);
  }

  @Patch(':id/toggle')
  @ApiBearerAuth()
  async toggle(@Param('id') id: string) {
    return this.mediaService.toggleActive(id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }
}