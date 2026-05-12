import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { HeroService } from './hero.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { UpsertHeroSlideLanguageDto } from './dto/upsert-hero-slide-language.dto';

@ApiTags('Hero')
@Controller('hero')
export class HeroController {
  constructor(private readonly service: HeroService) {}

  @Get('slides')
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  @ApiQuery({ name: 'isActive', required: false, example: 'true' })
  async getSlides(
    @Query('lang') lang?: string,
    @Query('isActive') isActive?: 'true' | 'false',
  ) {
    return this.service.getSlides({
      lang: lang ?? 'es',
      isActive: isActive ? isActive === 'true' : true,
    });
  }

  @Get('slides/:id')
  @ApiParam({ name: 'id', required: true })
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  async getSlideById(
    @Param('id') id: string,
    @Query('lang') lang?: string,
  ) {
    return this.service.getSlideById(id, lang ?? 'es');
  }

  @Post('slides')
  @ApiBearerAuth()
  @ApiBody({ type: CreateHeroSlideDto })
  create(@Body() dto: CreateHeroSlideDto) {
    return this.service.createSlide(dto);
  }

  /**
   * Actualiza datos generales del slide:
   * mediaId, order, isActive, linkUrl y textos legacy.
   */
  @Put('slides/:id')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', required: true })
  @ApiBody({ type: UpdateHeroSlideDto })
  update(@Param('id') id: string, @Body() dto: UpdateHeroSlideDto) {
    return this.service.updateSlide(id, dto);
  }

  /**
   * Actualiza o crea la traducción de un idioma.
   * Ejemplo:
   * PATCH /hero/slides/uuid/languages/en
   * PATCH /hero/slides/uuid/languages/es
   */
  @Patch('slides/:id/languages/:lang')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', required: true })
  @ApiParam({ name: 'lang', required: true, example: 'en' })
  @ApiBody({ type: UpsertHeroSlideLanguageDto })
  updateLanguage(
    @Param('id') id: string,
    @Param('lang') lang: string,
    @Body() dto: UpsertHeroSlideLanguageDto,
  ) {
    return this.service.upsertSlideLanguage(id, lang, dto);
  }

  @Delete('slides/:id')
  @ApiBearerAuth()
  @ApiParam({ name: 'id', required: true })
  remove(@Param('id') id: string) {
    return this.service.deleteSlide(id);
  }
}