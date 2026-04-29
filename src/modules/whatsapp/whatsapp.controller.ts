import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappWebhookDto } from './dto/whatsapp-webhook.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
  ) {}

  @Get('webhook')
  verifyWebhook(@Query() query: Record<string, string>, @Res() res: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    throw new UnauthorizedException('Invalid WhatsApp verify token');
  }

  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(@Body() body: WhatsappWebhookDto) {
    console.log('🔥 WEBHOOK WHATSAPP RAW:', JSON.stringify(body, null, 2));
  
    await this.whatsappService.handleIncomingWebhook(body);
  
    return {
      received: true,
    };
  }

  @Post('send-message')
  async sendMessage(@Body() dto: SendWhatsappMessageDto) {
    return this.whatsappService.sendTextMessage(dto.to, dto.message);
  }
}