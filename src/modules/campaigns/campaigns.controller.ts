import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QuoteCampaignDto } from './dto/quote-campaign.dto';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  @ApiQuery({ name: 'packageCode', required: false })
  findAll(@Query('packageCode') packageCode?: string) {
    return this.service.findAll(packageCode);
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.service.findOneByCode(code);
  }

  @Get('package/:packageCode/active')
  findActiveByPackage(@Param('packageCode') packageCode: string) {
    return this.service.findActiveByPackageCode(packageCode);
  }

  @Post()
  @ApiBearerAuth()
  @ApiBody({ type: CreateCampaignDto })
  create(@Body() dto: CreateCampaignDto) {
    return this.service.create(dto);
  }

  @Patch(':code')
  @ApiBearerAuth()
  @ApiBody({ type: UpdateCampaignDto })
  update(@Param('code') code: string, @Body() dto: UpdateCampaignDto) {
    return this.service.updateByCode(code, dto);
  }

  @Patch(':code/enable')
  @ApiBearerAuth()
  enable(@Param('code') code: string) {
    return this.service.enableByCode(code);
  }

  @Patch(':code/disable')
  @ApiBearerAuth()
  disable(@Param('code') code: string) {
    return this.service.disableByCode(code);
  }

  @Post('quote')
  @ApiBody({ type: QuoteCampaignDto })
  quote(@Body() dto: QuoteCampaignDto) {
    return this.service.quote(dto);
  }
}