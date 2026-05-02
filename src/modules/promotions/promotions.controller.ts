import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
  } from '@nestjs/common';
  import { PromotionsService } from './promotions.service';
  import { CreatePromotionDto } from './dto/create-promotion.dto';
  import { UpdatePromotionDto } from './dto/update-promotion.dto';
  import { ReorderPromotionsDto } from './dto/reorder-promotions.dto';
  
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