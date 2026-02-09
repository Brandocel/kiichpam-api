import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HeroService } from './hero.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@ApiTags('Hero')
@Controller('hero')
export class HeroController {
  constructor(private readonly service: HeroService) {}

  @Get('slides')
  @ApiQuery({ name: 'isActive', required: false, example: 'true' })
  async getSlides(@Query('isActive') isActive?: 'true' | 'false') {
    return this.service.getSlides({
      isActive: isActive ? isActive === 'true' : true,
    });
  }

  @Post('slides')
  @ApiBearerAuth()
  create(@Body() dto: CreateHeroSlideDto) {
    return this.service.createSlide(dto);
  }

  @Patch('slides/:id')
  @ApiBearerAuth()
  update(@Param('id') id: string, @Body() dto: UpdateHeroSlideDto) {
    return this.service.updateSlide(id, dto);
  }

  @Delete('slides/:id')
  @ApiBearerAuth()
  remove(@Param('id') id: string) {
    return this.service.deleteSlide(id);
  }
}
