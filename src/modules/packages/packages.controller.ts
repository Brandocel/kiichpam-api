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
  @ApiQuery({ name: 'adults', required: false, example: 2 })
  @ApiQuery({ name: 'children', required: false, example: 0 })
  @ApiQuery({ name: 'infants', required: false, example: 0 })
  @ApiQuery({
    name: 'quoteAt',
    required: false,
    example: '2026-04-07T12:00:00.000Z',
  })
  @ApiQuery({ name: 'withCampaign', required: false, example: true })
  findAll(
    @Query('lang') lang?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('infants') infants?: string,
    @Query('quoteAt') quoteAt?: string,
    @Query('withCampaign') withCampaign?: string,
  ) {
    return this.service.findAllResolved({
      lang: lang ?? 'es',
      adults: Number(adults ?? 0),
      children: Number(children ?? 0),
      infants: Number(infants ?? 0),
      quoteAt,
      withCampaign:
        withCampaign === 'true' ||
        withCampaign === '1' ||
        withCampaign === 'yes',
    });
  }

  @Get(':code')
  @ApiQuery({ name: 'lang', required: false, example: 'es' })
  @ApiQuery({ name: 'adults', required: false, example: 2 })
  @ApiQuery({ name: 'children', required: false, example: 0 })
  @ApiQuery({ name: 'infants', required: false, example: 0 })
  @ApiQuery({
    name: 'quoteAt',
    required: false,
    example: '2026-04-07T12:00:00.000Z',
  })
  @ApiQuery({ name: 'withCampaign', required: false, example: true })
  findOne(
    @Param('code') code: string,
    @Query('lang') lang?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('infants') infants?: string,
    @Query('quoteAt') quoteAt?: string,
    @Query('withCampaign') withCampaign?: string,
  ) {
    return this.service.findByCodeResolved(code, {
      lang: lang ?? 'es',
      adults: Number(adults ?? 0),
      children: Number(children ?? 0),
      infants: Number(infants ?? 0),
      quoteAt,
      withCampaign:
        withCampaign === 'true' ||
        withCampaign === '1' ||
        withCampaign === 'yes',
    });
  }

  @Post()
  @ApiBody({ type: CreatePackageDto })
  create(@Body() dto: CreatePackageDto) {
    return this.service.create(dto);
  }

  @Put(':code')
  @ApiBearerAuth()
  @ApiBody({ type: CreatePackageDto })
  replace(@Param('code') code: string, @Body() dto: CreatePackageDto) {
    return this.service.replaceByCode(code, dto);
  }

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

  @Patch(':code')
  @ApiBearerAuth()
  @ApiBody({ type: UpdatePackageDto })
  update(@Param('code') code: string, @Body() dto: UpdatePackageDto) {
    return this.service.updateByCode(code, dto);
  }

  @Delete(':code')
  @ApiBearerAuth()
  softDelete(@Param('code') code: string) {
    return this.service.softDeleteByCode(code);
  }
}