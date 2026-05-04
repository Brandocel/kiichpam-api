import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiBody({ type: CreateContactMessageDto })
  sendContactMessage(@Body() dto: CreateContactMessageDto) {
    return this.contactService.sendContactMessage(dto);
  }
}