import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  getPing() {
    return {
      ok: true,
      message: 'pong',
      service: 'kiichpam-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth() {
    return {
      ok: true,
      service: 'kiichpam-api',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }
}