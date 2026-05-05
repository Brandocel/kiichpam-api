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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';
import { randomUUID } from 'crypto';

import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ReorderPromotionsDto } from './dto/reorder-promotions.dto';

const PROMOTION_UPLOAD_PATH = './uploads/promotions';

const allowedImageMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get('public')
  findPublicPromotions() {
    return this.promotionsService.findPublicPromotions();
  }

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderPromotionsDto) {
    return this.promotionsService.reorder(dto);
  }

  /**
   * PATCH /promotions/:id/image
   *
   * FormData:
   * image: File
   */
  @Patch(':id/image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          if (!existsSync(PROMOTION_UPLOAD_PATH)) {
            mkdirSync(PROMOTION_UPLOAD_PATH, { recursive: true });
          }

          callback(null, PROMOTION_UPLOAD_PATH);
        },
        filename: (_req, file, callback) => {
          const originalExt = extname(file.originalname).toLowerCase();
          const safeExt = originalExt || '.jpg';
          const filename = `promotion-${Date.now()}-${randomUUID()}${safeExt}`;

          callback(null, filename);
        },
      }),
      fileFilter: (_req, file, callback) => {
        if (!allowedImageMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Solo se permiten imágenes JPG, JPEG, PNG o WEBP.',
            ),
            false,
          );
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    }),
  )
  replaceImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.promotionsService.replaceImage(id, file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
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