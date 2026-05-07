import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { IntegrationApiKeyGuard } from '../guards/integration-api-key.guard';

export function IntegrationProtected() {
  return applyDecorators(
    UseGuards(IntegrationApiKeyGuard),

    ApiBasicAuth('integration-basic'),
    ApiSecurity('x-api-key'),
    ApiSecurity('x-api-secret'),

    ApiUnauthorizedResponse({
      description:
        'No autorizado. Debes enviar credenciales válidas de integración.',
    }),
  );
}