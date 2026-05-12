import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

import {
  PromotionsService,
  type PromotionImageUploadFile,
} from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ReorderPromotionsDto } from './dto/reorder-promotions.dto';
import { UpsertPromotionLanguageDto } from './dto/upsert-promotion-language.dto';

function sanitizeBaseName(originalName: string) {
  const cleaned = (originalName || 'file')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_\.]/g, '')
    .toLowerCase();

  const ext = extname(cleaned);
  const base = ext ? cleaned.slice(0, -ext.length) : cleaned;

  return {
    base: (base || 'file').slice(-80),
    ext,
  };
}

function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
  };

  return extensions[mimeType] || '.bin';
}

function imageFileFilter(
  _req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new BadRequestException(`Tipo de imagen no permitido: ${file.mimetype}`),
      false,
    );
  }

  cb(null, true);
}

function preparePromotionImageFile(
  file: PromotionImageUploadFile,
): PromotionImageUploadFile {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const { base, ext } = sanitizeBaseName(file.originalname);

  const safeExt = ext || getExtensionFromMimeType(file.mimetype);
  const filename = `${unique}-${base}${safeExt}`;

  return {
    ...file,
    filename,
  };
}

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get('public')
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  findPublicPromotions(@Query('lang') lang?: string) {
    return this.promotionsService.findPublicPromotions(lang ?? 'es');
  }

  @Get()
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  findAll(@Query('lang') lang?: string) {
    return this.promotionsService.findAll(lang ?? 'es');
  }

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderPromotionsDto) {
    return this.promotionsService.reorder(dto);
  }

  @Patch(':id/languages/:lang')
  @ApiParam({ name: 'id', required: true })
  @ApiParam({ name: 'lang', required: true, example: 'en' })
  @ApiBody({ type: UpsertPromotionLanguageDto })
  updateLanguage(
    @Param('id') id: string,
    @Param('lang') lang: string,
    @Body() dto: UpsertPromotionLanguageDto,
  ) {
    return this.promotionsService.upsertPromotionLanguage(id, lang, dto);
  }

  @Patch(':id/image')
  @ApiOperation({
    summary: 'Reemplazar la imagen de una promoción',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['image'],
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  replaceImage(
    @Param('id') id: string,
    @UploadedFile() file: PromotionImageUploadFile,
  ) {
    if (!file) {
      throw new BadRequestException('La imagen es obligatoria.');
    }

    const preparedFile = preparePromotionImageFile(file);

    return this.promotionsService.replaceImage(id, preparedFile);
  }

  @Get(':id')
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  findOne(@Param('id') id: string, @Query('lang') lang?: string) {
    return this.promotionsService.findOne(id, lang ?? 'es');
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }
}