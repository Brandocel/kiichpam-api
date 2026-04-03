import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ProposalReservationsService } from './proposal-reservations.service';
import { CreateProposalReservationDto } from './dto/create-proposal-reservation.dto';

@ApiTags('Proposal Reservations')
@Controller('proposal-reservations')
export class ProposalReservationsController {
  constructor(private readonly service: ProposalReservationsService) {}

  @Get('packages')
  findAllPackages() {
    return this.service.findAllPackages();
  }

  @Post()
  @ApiBody({ type: CreateProposalReservationDto })
  create(@Body() dto: CreateProposalReservationDto) {
    return this.service.create(dto);
  }
}