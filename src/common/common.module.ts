import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';

@Module({
  imports: [ConfigModule],
  providers: [IntegrationApiKeyGuard],
  exports: [IntegrationApiKeyGuard],
})
export class CommonModule {}