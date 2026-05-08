import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiHeader,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { IntegrationApiKeyGuard } from '../guards/integration-api-key.guard';

export function IntegrationProtected() {
  return applyDecorators(
    UseGuards(IntegrationApiKeyGuard),

    ApiBasicAuth('integration-basic'),

    ApiHeader({
      name: 'x-api-key',
      required: false,
      description:
        'Client key para integración. Alternativa a Basic Auth.',
    }),

    ApiHeader({
      name: 'x-api-secret',
      required: false,
      description:
        'Client secret para integración. Alternativa a Basic Auth.',
    }),

    ApiUnauthorizedResponse({
      description:
        'No autorizado. Debes enviar Basic Auth válido o headers x-api-key y x-api-secret válidos.',
    }),
  );
}