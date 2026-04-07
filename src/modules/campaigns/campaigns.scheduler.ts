import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';

@Injectable()
export class CampaignsScheduler {
  private readonly logger = new Logger(CampaignsScheduler.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncStatuses() {
    try {
      await this.campaignsService.refreshCampaignStatuses();
      this.logger.log('Campaign statuses synchronized');
    } catch (error) {
      this.logger.error('Error synchronizing campaign statuses', error?.stack);
    }
  }
}