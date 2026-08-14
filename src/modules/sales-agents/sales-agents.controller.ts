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
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { IntegrationProtected } from '../../common/decorators/integration-protected.decorator';
import { CreateSalesAgentDto } from './dto/create-sales-agent.dto';
import { QuerySalesAgentPerformanceDto } from './dto/query-sales-agent-performance.dto';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';
import { SalesAgentsService } from './sales-agents.service';

@ApiTags('Sales Agents')
@Controller('sales-agents')
export class SalesAgentsController {
  constructor(private readonly service: SalesAgentsService) {}

  /**
   * PÚBLICO
   * La web lo usa para validar un link de agente (`/reservar?ag=CODE`) y
   * mostrar de quién viene la reservación. Solo devuelve datos no sensibles.
   */
  @Get('public/:code')
  @ApiOperation({ summary: 'Resolver un agente activo por su código de link' })
  @ApiParam({ name: 'code', example: 'MARIA-LOPEZ' })
  findPublic(@Param('code') code: string) {
    return this.service.findPublicByCode(code);
  }

  /**
   * PROTEGIDO
   * Ranking de ventas y comisiones por agente.
   */
  @Get('performance')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Ventas y comisiones por agente en un rango' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  @ApiQuery({ name: 'agentCode', required: false, example: 'MARIA-LOPEZ' })
  performance(@Query() query: QuerySalesAgentPerformanceDto) {
    return this.service.performance(query);
  }

  @Get()
  @IntegrationProtected()
  @ApiOperation({ summary: 'Listar agentes de reservas' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Consultar un agente de reservas' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @IntegrationProtected()
  @ApiOperation({ summary: 'Dar de alta un agente de reservas' })
  create(@Body() dto: CreateSalesAgentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Actualizar un agente de reservas' })
  update(@Param('id') id: string, @Body() dto: UpdateSalesAgentDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/regenerate-link')
  @IntegrationProtected()
  @ApiOperation({
    summary: 'Generar un link nuevo para el agente (invalida el anterior)',
  })
  regenerateLink(@Param('id') id: string) {
    return this.service.regenerateLinkToken(id);
  }

  @Delete(':id')
  @IntegrationProtected()
  @ApiOperation({ summary: 'Eliminar un agente de reservas' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
