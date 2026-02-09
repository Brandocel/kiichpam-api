import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { SetPackageCoverDto } from './dto/set-package-cover.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@ApiTags('Packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @Get()
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  findAll(@Query('lang') lang?: string) {
    return this.service.findAll(lang ?? 'es');
  }

  @Get(':code')
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  findOne(@Param('code') code: string, @Query('lang') lang?: string) {
    return this.service.findByCode(code, lang ?? 'es');
  }

  @Post()
  @ApiBody({ type: CreatePackageDto })
  create(@Body() dto: CreatePackageDto) {
    return this.service.create(dto);
  }

  // =========================
  // ✅ COVER IMAGE ENDPOINTS
  // =========================

  @Patch(':code/cover')
  @ApiBearerAuth()
  @ApiBody({ type: SetPackageCoverDto })
  setCover(@Param('code') code: string, @Body() dto: SetPackageCoverDto) {
    return this.service.setCoverImage(code, dto.mediaId);
  }

  @Delete(':code/cover')
  @ApiBearerAuth()
  removeCover(@Param('code') code: string) {
    return this.service.removeCoverImage(code);
  }

  // =========================
  // ✅ UPDATE PACKAGE (opcional)
  // =========================
  @Patch(':code')
  @ApiBearerAuth()
  @ApiBody({ type: UpdatePackageDto })
  update(@Param('code') code: string, @Body() dto: UpdatePackageDto) {
    return this.service.updateByCode(code, dto);
  }

  // =========================
  // ✅ DELETE (SOFT) PACKAGE (opcional)
  // =========================
  @Delete(':code')
  @ApiBearerAuth()
  softDelete(@Param('code') code: string) {
    return this.service.softDeleteByCode(code);
  }
}
