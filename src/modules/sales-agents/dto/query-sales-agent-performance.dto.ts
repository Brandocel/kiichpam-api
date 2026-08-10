import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QuerySalesAgentPerformanceDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Fecha inicial. Filtra por fecha de visita.',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'Fecha final. Filtra por fecha de visita.',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    example: 'MARIA-LOPEZ',
    description: 'Limita el reporte a un solo agente.',
  })
  @IsOptional()
  @IsString()
  agentCode?: string;
}
