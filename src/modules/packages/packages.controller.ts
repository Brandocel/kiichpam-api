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
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';

import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { SetPackageCoverDto } from './dto/set-package-cover.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { IntegrationProtected } from '../../common/decorators/integration-protected.decorator';

@ApiTags('Packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  /**
   * Público.
   * Lo usa la web para mostrar paquetes.
   */
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

  /**
   * Público.
   * Lo usa la web para mostrar detalle de un paquete.
   */
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

  /**
   * Protegido.
   * Crear paquetes no debe ser público.
   */
  @Post()
  @IntegrationProtected()
  @ApiBody({ type: CreatePackageDto })
  create(@Body() dto: CreatePackageDto) {
    return this.service.create(dto);
  }

  /**
   * Protegido.
   * Reemplazar paquete no debe ser público.
   */
  @Put(':code')
  @IntegrationProtected()
  @ApiBody({ type: CreatePackageDto })
  replace(@Param('code') code: string, @Body() dto: CreatePackageDto) {
    return this.service.replaceByCode(code, dto);
  }

  /**
   * Protegido.
   * Modificar portada no debe ser público.
   */
  @Patch(':code/cover')
  @IntegrationProtected()
  @ApiBody({ type: SetPackageCoverDto })
  setCover(@Param('code') code: string, @Body() dto: SetPackageCoverDto) {
    return this.service.setCoverImage(code, dto.mediaId);
  }

  /**
   * Protegido.
   * Eliminar portada no debe ser público.
   */
  @Delete(':code/cover')
  @IntegrationProtected()
  removeCover(@Param('code') code: string) {
    return this.service.removeCoverImage(code);
  }

  /**
   * Protegido.
   * Actualizar paquete no debe ser público.
   */
  @Patch(':code')
  @IntegrationProtected()
  @ApiBody({ type: UpdatePackageDto })
  update(@Param('code') code: string, @Body() dto: UpdatePackageDto) {
    return this.service.updateByCode(code, dto);
  }

  /**
   * Protegido.
   * Borrado lógico no debe ser público.
   */
  @Delete(':code')
  @IntegrationProtected()
  softDelete(@Param('code') code: string) {
    return this.service.softDeleteByCode(code);
  }
}